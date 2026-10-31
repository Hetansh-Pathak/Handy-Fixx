import {
  formatBookingWhen, heldFromSummary, openRequests, providerBusy, providerLaunchStatus, requestAccess, requestEconomics, walletStateFromSummary, type BusyResult, type LaunchStatus, type WalletState,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useSession } from "@/features/auth/session-provider";
import { OfferAlert } from "@/features/dispatch/OfferAlert";
import { fetchOpenOffers, offersKey, reportPresence, type OpenOffer } from "@/features/dispatch/pro-api";
import { env } from "@/lib/env";
import { configureNotificationHandler, notifyLockedRequest, notifyNewRequest, onRequestTapped } from "@/lib/notifications";
import { getSupabase } from "@/lib/supabase";
import { fetchPendingRequests, fetchProviderBookings, fetchWalletSummary, jobSlotOf, serviceNameOf, setOnline, touchPresence, type ProviderBooking } from "./api";
import { RequestPopup } from "./RequestPopup";
import { clearApproxArea, ensureBackgroundLocation, shareApproxArea, startPresence, stopPresence } from "./tracking";

const HEARTBEAT_MS = 30_000;
const AREA_REFRESH_MS = 10 * 60_000;
const POLL_MS = 8_000;

type Runtime = {
  online: boolean;
  canGoOnline: boolean;
  /** Why the switch is off (not approved yet), or null. */
  switchBlockedReason: string | null;
  toggling: boolean;
  /** A non-blocking heads-up, e.g. "keep the app open to receive requests". */
  notice: string | null;
  error: string | null;
  toggleOnline: () => Promise<void>;
  /** Spendable money: fees held for accepted jobs are already taken out. */
  wallet: WalletState;
  /** Fees reserved for accepted jobs (0 until proposal 20261114 is applied). */
  held: number;
  walletReady: boolean;
  launch: LaunchStatus;
  refreshWallet: () => Promise<void>;
  /** One job at a time: is this pro busy for that request (a job in progress, or an overlapping confirmed one)? */
  busyOf: (b: ProviderBooking) => BusyResult;
  /** Requests waiting for this pro's answer (no countdown), oldest first. */
  openRequests: ProviderBooking[];
  /** Hide the banner for a request once the pro has opened it. */
  markRequestSeen: (id: string) => void;
  /** Instant dispatch: offers waiting for this pro (empty while the switch is off). */
  openOffers: OpenOffer[];
  /** Show the full-screen alert for an offer again (from Jobs -> New). */
  showOffer: (bookingId: string) => void;
};

/** The heartbeat's position for instant dispatch (permission was asked when going online; never asks here). */
async function sendPosition(): Promise<void> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return;
    const pos = (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    if (pos) await reportPresence({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
  } catch {
    /* no position this time: the next heartbeat tries again */
  }
}

const RuntimeContext = createContext<Runtime | null>(null);

export function ProviderRuntime({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { provider, userId, refresh } = useSession();
  const providerId = provider?.id ?? null;

  const [online, setOnlineState] = useState<boolean>(provider?.is_online === true);
  const [toggling, setToggling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const notified = useRef(new Set<string>());
  const appActive = useRef(true);

  const approved = provider?.status === "active" && provider?.kyc_status === "approved";
  const canGoOnline = approved;
  const switchBlockedReason = approved
    ? null
    : provider?.kyc_status === "pending"
      ? "Your documents are under review. You can go online once you are approved."
      : provider?.kyc_status === "rejected"
        ? "Fix what the reviewer asked for and submit your identity check again to go online."
        : "Complete your identity check to go online.";

  // ── wallet and launch period ───────────────────────────────────────────────
  const walletQuery = useQuery({
    queryKey: ["wallet-summary", providerId],
    enabled: !!providerId,
    refetchInterval: 60_000,
    queryFn: fetchWalletSummary,
  });
  const wallet = useMemo(() => walletStateFromSummary(walletQuery.data), [walletQuery.data]);
  const held = heldFromSummary(walletQuery.data);
  const launch = useMemo(
    () => providerLaunchStatus({ kycReviewedAt: provider?.kyc_reviewed_at, totalJobs: provider?.total_jobs }, new Date()),
    [provider?.kyc_reviewed_at, provider?.total_jobs, now.getMinutes()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── presence: tell the server "still online" while the app is open (and via a foreground service when it is not) ──
  useEffect(() => {
    if (!online || !providerId) return;
    const sub = AppState.addEventListener("change", (s) => {
      appActive.current = s === "active";
      if (s === "active") { void touchPresence(providerId).catch(() => undefined); if (env.instantDispatch) void sendPosition(); }
    });
    void touchPresence(providerId).catch(() => undefined);
    if (env.instantDispatch) void sendPosition();
    void shareApproxArea(providerId); // for the customer's "Nearest" sort; also covers a restart while online
    const id = setInterval(() => {
      if (!appActive.current) return;
      void touchPresence(providerId).catch(() => undefined);
      if (env.instantDispatch) void sendPosition();
    }, HEARTBEAT_MS);
    const area = setInterval(() => { if (appActive.current) void shareApproxArea(providerId); }, AREA_REFRESH_MS);
    return () => { clearInterval(id); clearInterval(area); sub.remove(); };
  }, [online, providerId]);

  // ── incoming requests: realtime for speed, polling as the safety net ───────
  const requests = useQuery({
    queryKey: ["provider-requests", providerId],
    enabled: online && !!providerId,
    refetchInterval: POLL_MS,
    queryFn: () => fetchPendingRequests(providerId!),
  });

  // The pro's own jobs (the Jobs tab reads the same cache): the one-job-at-a-time rule compares requests with them.
  const myJobs = useQuery({
    queryKey: ["provider-bookings", providerId],
    enabled: !!providerId,
    refetchInterval: 30_000,
    queryFn: () => fetchProviderBookings(providerId!),
  });
  const busyOf = useCallback(
    (b: ProviderBooking): BusyResult => providerBusy({ jobs: (myJobs.data ?? []).map(jobSlotOf), request: jobSlotOf(b) }),
    [myJobs.data],
  );

  useEffect(() => {
    if (!online || !providerId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`provider-requests-${providerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `provider_id=eq.${providerId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["provider-requests", providerId] });
        void queryClient.invalidateQueries({ queryKey: ["provider-bookings", providerId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [online, providerId, queryClient]);

  // -- instant dispatch offers: realtime for speed, polling as the safety net --
  const offers = useQuery({
    queryKey: offersKey(providerId),
    enabled: env.instantDispatch && online && !!providerId,
    refetchInterval: POLL_MS,
    queryFn: fetchOpenOffers,
  });
  useEffect(() => {
    if (!env.instantDispatch || !online || !providerId) return;
    const supabase = getSupabase();
    const channel = supabase
      // Unique name: joining the same channel twice crashes the app.
      .channel(`provider-offers-${providerId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_offers", filter: `provider_id=eq.${providerId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: offersKey(providerId) });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [online, providerId, queryClient]);
  const openOffers = useMemo(() => (env.instantDispatch && online ? offers.data ?? [] : []), [online, offers.data]);
  const [offerShown, setOfferShown] = useState<string | null>(null);
  const unseenOffer = offerShown ?? openOffers.find((o) => !seen.has(o.bookingId))?.bookingId ?? null;
  const showOffer = useCallback((id: string) => setOfferShown(id), []);
  const closeOffer = useCallback((id: string) => {
    setOfferShown(null);
    setSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    void queryClient.invalidateQueries({ queryKey: offersKey(providerId) });
  }, [queryClient, providerId]);
  useEffect(() => {
    for (const o of openOffers) {
      if (notified.current.has(o.bookingId)) continue;
      notified.current.add(o.bookingId);
      void notifyNewRequest({ bookingId: o.bookingId, title: "New job near you", body: "Tap to see the job and accept it. The first pro to accept gets it." });
    }
  }, [openOffers]);

  useEffect(() => {
    if (!online) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [online]);

  const open = useMemo(() => (online ? openRequests(requests.data ?? [], now) : []), [online, requests.data, now]);
  const unseen = open.filter((r) => !seen.has(r.id));
  const markRequestSeen = useCallback((id: string) => setSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id))), []);
  const openRequest = useCallback((id: string) => {
    // A tapped notification for an instant-dispatch offer opens the offer (the job itself is not theirs yet).
    if (openOffers.some((o) => o.bookingId === id)) { setOfferShown(id); return; }
    markRequestSeen(id);
    router.push({ pathname: "/provider/job/[id]", params: { id } });
  }, [markRequestSeen, router, openOffers]);

  const accessOf = useCallback(
    (r: ProviderBooking) => requestAccess({ price: Number(r.provider_amount ?? 0), wallet, launchActive: launch.active, walletReady: walletQuery.isSuccess, busy: busyOf(r) }),
    [wallet, launch.active, walletQuery.isSuccess, busyOf],
  );

  // A phone notification once per new request. No countdown: the pro reviews it and answers when ready.
  // A request the wallet cannot cover gets a QUIET one (no ring) that points at the recharge.
  useEffect(() => {
    for (const r of open) {
      if (notified.current.has(r.id)) continue;
      notified.current.add(r.id);
      const access = accessOf(r);
      const when = `${formatBookingWhen(r.booking_date, r.booking_time)} · ${r.city ?? "Nearby"}`;
      if (access.state === "locked" || access.state === "busy") {
        const title = access.state === "busy" ? `Request while you are on a job: ${serviceNameOf(r)}` : `Locked request: ${serviceNameOf(r)}`;
        void notifyLockedRequest({ bookingId: r.id, title, body: `${when}. ${access.cta}.` });
      } else {
        void notifyNewRequest({ bookingId: r.id, title: `New request: ${serviceNameOf(r)}`, body: `${when}. Tap to see the details and decide.` });
      }
    }
  }, [open, accessOf]);

  useEffect(() => {
    configureNotificationHandler();
    return onRequestTapped(openRequest);
  }, [openRequest]);

  const toggleOnline = useCallback(async () => {
    if (!providerId || toggling) return;
    setToggling(true);
    setError(null);
    setNotice(null);
    try {
      if (online) {
        await setOnline(providerId, false);
        setOnlineState(false);
        await stopPresence().catch(() => undefined);
        void clearApproxArea(providerId);
      } else {
        const actual = await setOnline(providerId, true);
        setOnlineState(actual);
        if (!actual) {
          setError("You could not go online. Check that your account is approved.");
        } else {
          try {
            const perm = await ensureBackgroundLocation();
            if (perm === "granted") await startPresence(providerId);
            else setNotice("Keep HandyFix open to receive requests. Allow location “all the time” to stay online when the app is closed.");
          } catch {
            setNotice("Keep HandyFix open to receive requests (background mode needs the phone app).");
          }
        }
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change your status.");
    } finally {
      setToggling(false);
    }
  }, [providerId, online, toggling, refresh]);

  const refreshWallet = useCallback(async () => { await queryClient.invalidateQueries({ queryKey: ["wallet-summary", providerId] }); }, [queryClient, providerId]);

  const value = useMemo<Runtime>(
    () => ({
      online, canGoOnline, switchBlockedReason, toggling, notice, error, toggleOnline, wallet, held, walletReady: walletQuery.isSuccess, launch, refreshWallet,
      busyOf, openRequests: open, markRequestSeen, openOffers, showOffer,
    }),
    [online, canGoOnline, switchBlockedReason, toggling, notice, error, toggleOnline, wallet, held, walletQuery.isSuccess, launch, refreshWallet, busyOf, open, markRequestSeen, openOffers, showOffer],
  );

  void userId;
  return (
    <RuntimeContext.Provider value={value}>
      {children}
      {unseenOffer ? (
        <OfferAlert
          key={unseenOffer}
          bookingId={unseenOffer}
          more={Math.max(0, openOffers.filter((o) => !seen.has(o.bookingId)).length - 1)}
          onAccepted={(id) => {
            closeOffer(id);
            void queryClient.invalidateQueries({ queryKey: ["provider-bookings", providerId] });
            router.push({ pathname: "/provider/job/[id]", params: { id } });
          }}
          onRecharge={() => { closeOffer(unseenOffer); router.push("/provider/wallet"); }}
          onClose={() => closeOffer(unseenOffer)}
        />
      ) : unseen[0] ? (
        <RequestPopup
          key={unseen[0].id}
          request={unseen[0]}
          economics={requestEconomics({ price: Number(unseen[0].provider_amount ?? 0), launchActive: launch.active })}
          access={accessOf(unseen[0])}
          more={unseen.length - 1}
          onView={() => openRequest(unseen[0]!.id)}
          onRecharge={() => { markRequestSeen(unseen[0]!.id); router.push("/provider/wallet"); }}
          onCurrentJob={(jobId) => { markRequestSeen(unseen[0]!.id); router.push({ pathname: "/provider/job/[id]", params: { id: jobId } }); }}
          onLater={() => markRequestSeen(unseen[0]!.id)}
        />
      ) : null}
    </RuntimeContext.Provider>
  );
}

export function useProviderRuntime(): Runtime {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error("useProviderRuntime must be used inside <ProviderRuntime>");
  return ctx;
}
