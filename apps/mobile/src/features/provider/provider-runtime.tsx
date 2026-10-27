import {
  acceptBlockMessage, checkCanAccept, declinePatch, isRequestOpen, pickCurrentRequest, providerActionPatch,
  providerLaunchStatus, requestEconomics, walletStateFromSummary, type LaunchStatus, type WalletState,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useSession } from "@/features/auth/session-provider";
import { getSupabase } from "@/lib/supabase";
import { applyBookingPatch, fetchPendingRequests, fetchWalletSummary, setOnline, touchPresence } from "./api";
import { RequestAlert } from "./RequestAlert";
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
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [answering, setAnswering] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
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
    const id = setInterval(() => setNow(new Date()), 500);
    return () => clearInterval(id);
  }, [online]);

  const request = useMemo(() => {
    if (!online) return null;
    return pickCurrentRequest((requests.data ?? []).filter((r) => !dismissed.has(r.id)), now);
  }, [online, requests.data, dismissed, now]);

  const dismiss = useCallback((id: string) => setDismissed((prev) => new Set(prev).add(id)), []);

  const economics = request ? requestEconomics({ price: Number(request.provider_amount ?? 0), launchActive: launch.active }) : null;
  const acceptCheck = request
    ? checkCanAccept({ wallet, estimatedServiceBill: Number(request.provider_amount ?? 0), launchActive: launch.active })
    : null;
  const blockedMessage = acceptCheck && !acceptCheck.ok ? acceptBlockMessage(acceptCheck) : null;

  const accept = useCallback(async () => {
    if (!request || !providerId || blockedMessage) return;
    setAnswering(true);
    setRequestError(null);
    try {
      await applyBookingPatch(request.id, providerId, providerActionPatch("accept", new Date()).patch);
      dismiss(request.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["provider-requests", providerId] }),
        queryClient.invalidateQueries({ queryKey: ["provider-bookings", providerId] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-summary", providerId] }),
      ]);
      router.push({ pathname: "/provider/job/[id]", params: { id: request.id } });
    } catch (e) {
      // The database enforces the same wallet rule: show exactly what it said.
      setRequestError(e instanceof Error ? e.message : "Could not accept this request.");
    } finally {
      setAnswering(false);
    }
  }, [request, providerId, blockedMessage, dismiss, queryClient, router]);

  const decline = useCallback(async () => {
    if (!request || !providerId) return;
    setAnswering(true);
    setRequestError(null);
    try {
      await applyBookingPatch(request.id, providerId, declinePatch(new Date()));
      dismiss(request.id);
      await queryClient.invalidateQueries({ queryKey: ["provider-requests", providerId] });
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : "Could not decline this request.");
    } finally {
      setAnswering(false);
    }
  }, [request, providerId, dismiss, queryClient]);

  // A request nobody answered in 30 s is no longer ours to accept (it is offered to other pros).
  const expire = useCallback(() => { if (request) dismiss(request.id); }, [request, dismiss]);

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
    () => ({ online, canGoOnline, switchBlockedReason, toggling, notice, error, toggleOnline, wallet, walletReady: walletQuery.isSuccess, launch, refreshWallet }),
    [online, canGoOnline, switchBlockedReason, toggling, notice, error, toggleOnline, wallet, walletQuery.isSuccess, launch, refreshWallet],
  );

  void userId;
  return (
    <RuntimeContext.Provider value={value}>
      {children}
      {request && economics && isRequestOpen({ status: request.status, createdAt: request.created_at }, now) ? (
        <RequestAlert
          key={request.id}
          request={request}
          economics={economics}
          blockedMessage={blockedMessage}
          busy={answering}
          error={requestError}
          onAccept={() => void accept()}
          onDecline={() => void decline()}
          onExpire={expire}
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
