import {
  formatBookingWhen, openRequests, providerLaunchStatus, requestEconomics, walletStateFromSummary, type LaunchStatus, type WalletState,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useSession } from "@/features/auth/session-provider";
import { configureNotificationHandler, notifyNewRequest, onRequestTapped } from "@/lib/notifications";
import { getSupabase } from "@/lib/supabase";
import { fetchPendingRequests, fetchWalletSummary, serviceNameOf, setOnline, touchPresence, type ProviderBooking } from "./api";
import { RequestPopup } from "./RequestPopup";
import { ensureBackgroundLocation, startPresence, stopPresence } from "./tracking";

const HEARTBEAT_MS = 30_000;
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
  wallet: WalletState;
  walletReady: boolean;
  launch: LaunchStatus;
  refreshWallet: () => Promise<void>;
  /** Requests waiting for this pro's answer (no countdown), oldest first. */
  openRequests: ProviderBooking[];
  /** Hide the banner for a request once the pro has opened it. */
  markRequestSeen: (id: string) => void;
};

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
      : "Complete your identity check to go online.";

  // ── wallet and launch period ───────────────────────────────────────────────
  const walletQuery = useQuery({
    queryKey: ["wallet-summary", providerId],
    enabled: !!providerId,
    refetchInterval: 60_000,
    queryFn: fetchWalletSummary,
  });
  const wallet = useMemo(() => walletStateFromSummary(walletQuery.data), [walletQuery.data]);
  const launch = useMemo(
    () => providerLaunchStatus({ kycReviewedAt: provider?.kyc_reviewed_at, totalJobs: provider?.total_jobs }, new Date()),
    [provider?.kyc_reviewed_at, provider?.total_jobs, now.getMinutes()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── presence: tell the server "still online" while the app is open (and via a foreground service when it is not) ──
  useEffect(() => {
    if (!online || !providerId) return;
    const sub = AppState.addEventListener("change", (s) => {
      appActive.current = s === "active";
      if (s === "active") void touchPresence(providerId).catch(() => undefined);
    });
    void touchPresence(providerId).catch(() => undefined);
    const id = setInterval(() => { if (appActive.current) void touchPresence(providerId).catch(() => undefined); }, HEARTBEAT_MS);
    return () => { clearInterval(id); sub.remove(); };
  }, [online, providerId]);

  // ── incoming requests: realtime for speed, polling as the safety net ───────
  const requests = useQuery({
    queryKey: ["provider-requests", providerId],
    enabled: online && !!providerId,
    refetchInterval: POLL_MS,
    queryFn: () => fetchPendingRequests(providerId!),
  });

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

  useEffect(() => {
    if (!online) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [online]);

  const open = useMemo(() => (online ? openRequests(requests.data ?? [], now) : []), [online, requests.data, now]);
  const unseen = open.filter((r) => !seen.has(r.id));
  const markRequestSeen = useCallback((id: string) => setSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id))), []);
  const openRequest = useCallback((id: string) => {
    markRequestSeen(id);
    router.push({ pathname: "/provider/job/[id]", params: { id } });
  }, [markRequestSeen, router]);

  // A phone notification once per new request. No countdown: the pro reviews it and answers when ready.
  useEffect(() => {
    for (const r of open) {
      if (notified.current.has(r.id)) continue;
      notified.current.add(r.id);
      void notifyNewRequest({
        bookingId: r.id,
        title: `New request: ${serviceNameOf(r)}`,
        body: `${formatBookingWhen(r.booking_date, r.booking_time)} · ${r.city ?? "Nearby"}. Tap to see the details and decide.`,
      });
    }
  }, [open]);

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
      online, canGoOnline, switchBlockedReason, toggling, notice, error, toggleOnline, wallet, walletReady: walletQuery.isSuccess, launch, refreshWallet,
      openRequests: open, markRequestSeen,
    }),
    [online, canGoOnline, switchBlockedReason, toggling, notice, error, toggleOnline, wallet, walletQuery.isSuccess, launch, refreshWallet, open, markRequestSeen],
  );

  void userId;
  return (
    <RuntimeContext.Provider value={value}>
      {children}
      {unseen[0] ? (
        <RequestPopup
          key={unseen[0].id}
          request={unseen[0]}
          economics={requestEconomics({ price: Number(unseen[0].provider_amount ?? 0), launchActive: launch.active })}
          more={unseen.length - 1}
          onView={() => openRequest(unseen[0]!.id)}
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
