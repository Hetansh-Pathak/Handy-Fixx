import {
  acceptBlockMessage, canDecline, checkCanAccept, COMPLETION_CODE_LENGTH, declinePatch, formatBookingWhen,
  formatInr, interpretCompletion, isCompletionCode, isPatchAction, jobProgress, phoneVisibleToProvider, PROVIDER_ACTION_LABEL,
  providerActionPatch, providerStatusLabel, providerStep, requestEconomics, settleJob, type BookingStatus, type PatchAction, type Settlement,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Text, View } from "react-native";
import { Body, Button, Card, ErrorBanner, InfoBanner, Screen, ScreenHeader, TextField, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { applyBookingPatch, completeWithCode, fetchProviderBooking, serviceNameOf, type ProviderBooking } from "@/features/provider/api";
import { useProviderRuntime } from "@/features/provider/provider-runtime";
import { startJobTracking, stopJobTracking, ensureBackgroundLocation } from "@/features/provider/tracking";
import { env } from "@/lib/env";

const ACTIVE: BookingStatus[] = ["confirmed", "on_the_way", "arrived", "in_progress"];

export default function JobScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { provider, userId, refresh } = useSession();
  const rt = useProviderRuntime();
  const providerId = provider?.id ?? null;

  const query = useQuery({
    queryKey: ["provider-booking", id],
    enabled: !!id,
    refetchInterval: 10_000,
    queryFn: () => fetchProviderBooking(id),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const walletBefore = useRef(rt.wallet);
  walletBefore.current = rt.wallet;

  const booking = query.data;
  if (query.isPending) return <Screen><ScreenHeader title="Job" onBack={() => router.back()} /><Body muted>Loading…</Body></Screen>;
  if (query.isError || !booking || !providerId) {
    return (
      <Screen>
        <ScreenHeader title="Job" onBack={() => router.back()} />
        <ErrorBanner message={query.isError ? "Could not load this job." : "Job not found."} />
      </Screen>
    );
  }

  const status = booking.status as BookingStatus;
  const opts = { withArrivedStep: env.arrivedStatus };
  const step = providerStep(status, opts);
  const progress = jobProgress(status, opts);
  const price = Number(booking.provider_amount ?? 0);
  const economics = requestEconomics({ price, launchActive: rt.launch.active });
  const acceptCheck = checkCanAccept({ wallet: rt.wallet, estimatedServiceBill: price, launchActive: rt.launch.active });
  const blocked = !acceptCheck.ok ? acceptBlockMessage(acceptCheck) : null;
  const destination = booking.latitude != null && booking.longitude != null ? { latitude: Number(booking.latitude), longitude: Number(booking.longitude) } : null;

  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["provider-booking", id] }),
      queryClient.invalidateQueries({ queryKey: ["provider-bookings", providerId] }),
      queryClient.invalidateQueries({ queryKey: ["provider-requests", providerId] }),
      queryClient.invalidateQueries({ queryKey: ["wallet-summary", providerId] }),
    ]);
  };

  const run = async (action: PatchAction) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await applyBookingPatch(booking.id, providerId, providerActionPatch(action, new Date()).patch);
      if (action === "start_trip" && userId) {
        try {
          const perm = await ensureBackgroundLocation();
          if (perm === "denied") throw new Error("Location permission denied.");
          await startJobTracking({ bookingId: booking.id, userId, providerId, destination });
          if (perm === "foreground_only") setNotice("Keep HandyFix open so the customer can follow you. Allow location “all the time” to share while it is closed.");
        } catch (e) {
          // The trip has started either way; sharing the position is best effort.
          setNotice(e instanceof Error && e.message !== "Location permission denied." ? "Live location needs the phone app." : "Live location is off. Allow location so the customer can see you.");
        }
      }
      if (action === "arrived" || action === "start_job") await stopJobTracking().catch(() => undefined);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      await applyBookingPatch(booking.id, providerId, declinePatch(new Date()));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not decline.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!isCompletionCode(code)) { setCodeError(`Enter the ${COMPLETION_CODE_LENGTH}-digit code from the customer.`); return; }
    setBusy(true);
    setCodeError(null);
    setError(null);
    const walletSnapshot = walletBefore.current;
    try {
      const outcome = interpretCompletion(await completeWithCode(booking.id, code));
      if (outcome.kind === "error") {
        setCodeError(outcome.message);
        if (outcome.clearCode) setCode("");
        return;
      }
      await stopJobTracking().catch(() => undefined);
      // A preview of the fee. The database settles the real one when it completes the job.
      setSettlement(settleJob({ outcome: "completed", serviceBill: price, customerTotal: Number(booking.total_amount ?? price), wallet: walletSnapshot, launchActive: rt.launch.active }));
      await reload();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the job.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={serviceNameOf(booking)} onBack={() => router.back()} />
      {progress ? <Text className="text-sm font-semibold uppercase tracking-widest text-gold">Step {progress.current} of {progress.total}</Text> : null}
      <Title>{providerStatusLabel(status)}</Title>
      <ErrorBanner message={error} />
      <InfoBanner message={notice} />

      <CustomerCard booking={booking} status={status} />

      {status !== "completed" && status !== "cancelled" && !settlement ? (
        <Card>
          <Line label="You earn" value={formatInr(economics.earning)} strong />
          <Line label="HandyFix fee" value={economics.feeWaived ? `${formatInr(economics.fee)} waived` : formatInr(economics.fee)} />
          <Line label="You keep" value={formatInr(economics.youKeep)} />
          <Text className="text-xs text-muted">The customer pays you directly by UPI or cash. The fee is taken from your wallet only after the job closes.</Text>
        </Card>
      ) : null}

      {status === "pending" ? (
        <>
          <ErrorBanner message={blocked} />
          <Button label="Accept" loading={busy} disabled={!!blocked} onPress={() => void run("accept")} />
          {canDecline(status) ? <Button label="Decline" variant="secondary" disabled={busy} onPress={() => void decline()} /> : null}
        </>
      ) : null}

      {ACTIVE.includes(status) && step && isPatchAction(step.action) ? (
        <Button label={PROVIDER_ACTION_LABEL[step.action]} loading={busy} onPress={() => void run(step.action as PatchAction)} />
      ) : null}

      {status === "in_progress" && !settlement ? (
        <Card>
          <Text className="text-lg font-semibold text-white">Finish the job</Text>
          <Body muted>Ask the customer for their {COMPLETION_CODE_LENGTH}-digit code once they are happy with the work.</Body>
          <TextField label="Customer's code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, "").slice(0, COMPLETION_CODE_LENGTH)); setCodeError(null); }}
            error={codeError ?? undefined} keyboardType="number-pad" maxLength={COMPLETION_CODE_LENGTH} autoComplete="off" />
          <Button label={PROVIDER_ACTION_LABEL.enter_code} loading={busy} onPress={() => void submitCode()} />
        </Card>
      ) : null}

      {settlement || status === "completed" ? (
        <Card>
          <Text className="text-lg font-semibold text-ok">Job completed</Text>
          <Line label="Final bill" value={formatInr(price)} />
          {settlement ? (
            <>
              <Line label="HandyFix fee" value={settlement.waived > 0 ? `${formatInr(settlement.slabFee)} waived` : formatInr(settlement.slabFee)} />
              <Line label="You keep" value={formatInr(settlement.providerNet)} strong />
              {settlement.addedToDue > 0 ? <Text className="text-sm text-danger">Your wallet was short, so {formatInr(settlement.addedToDue)} was added to your dues. Top up to accept new jobs.</Text> : null}
            </>
          ) : null}
          <Text className="text-xs text-muted">The customer can raise a problem for 24 hours after completion.</Text>
          <Button label={PROVIDER_ACTION_LABEL.done} onPress={() => router.replace("/provider/jobs")} />
        </Card>
      ) : null}

      {status === "cancelled" ? <Card><Body muted>This job was cancelled. Nothing was charged.</Body></Card> : null}
    </Screen>
  );
}

function CustomerCard({ booking, status }: { booking: ProviderBooking; status: BookingStatus }) {
  const showPhone = phoneVisibleToProvider(status);
  const where = [booking.address, booking.city, booking.pincode].filter(Boolean).join(", ");
  const active = ACTIVE.includes(status);
  return (
    <Card>
      <Line label="Customer" value={booking.customer_name ?? "Customer"} />
      <Line label="When" value={formatBookingWhen(booking.booking_date, booking.booking_time)} />
      <Line label="Where" value={where || "Address not shared"} />
      {booking.special_instructions ? <Line label="Notes" value={booking.special_instructions} /> : null}
      {showPhone && booking.customer_phone ? (
        <Button label={`Call ${booking.customer_phone}`} variant="secondary" onPress={() => void Linking.openURL(`tel:${booking.customer_phone}`)} />
      ) : (
        <Text className="text-xs text-muted">{status === "pending" ? "The customer's phone number appears after you accept." : ""}</Text>
      )}
      {active ? (
        <Button label="Navigate" variant="secondary" onPress={() => {
          const dest = booking.latitude != null && booking.longitude != null
            ? `${booking.latitude},${booking.longitude}`
            : encodeURIComponent(where);
          void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`);
        }} />
      ) : null}
    </Card>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="text-base text-muted">{label}</Text>
      <Text className={`flex-1 text-right text-base ${strong ? "font-bold text-gold" : "text-white"}`}>{value}</Text>
    </View>
  );
}
