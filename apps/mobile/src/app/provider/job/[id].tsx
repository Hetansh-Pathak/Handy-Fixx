import {
  acceptBlockMessage, canDecline, checkCanAccept, COMPLETION_CODE_LENGTH, declinePatch, formatBookingWhen,
  formatInr, interpretCompletion, isCompletionCode, isPatchAction, isRequestOpen, jobProgress, phoneVisibleToProvider, PROVIDER_ACTION_LABEL,
  providerActionPatch, providerStatusLabel, providerStep, requestEconomics, settleJob, type BookingStatus, type PatchAction, type Settlement,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, ErrorBanner, InfoBanner, Screen, ScreenHeader, TextField, Title } from "@/components/ui";
import { AttachmentGallery } from "@/features/attachments/components";
import { useSession } from "@/features/auth/session-provider";
import { ProviderDispute } from "@/features/disputes/components";
import { ProviderExtras } from "@/features/extras/components";
import { applyBookingPatch, completeWithCode, fetchFeeRecord, fetchProviderBooking, serviceNameOf, type ProviderBooking } from "@/features/provider/api";
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
  const { markRequestSeen } = rt;

  // Opening a request is "seeing" it: its banner goes away (the request itself stays until answered).
  useEffect(() => { if (id) markRequestSeen(id); }, [id, markRequestSeen]);

  const booking = query.data;
  const feeRecord = useQuery({
    queryKey: ["fee-record", id],
    enabled: booking?.status === "completed",
    queryFn: () => fetchFeeRecord(id),
    // The database writes the record as the job closes; retry briefly if it is not there yet.
    refetchInterval: (q) => (q.state.data || q.state.dataUpdateCount > 6 ? false : 5_000),
  });
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
  // provider_amount includes approved extras; parts never count toward the fee (PDF p.3, p.8).
  const price = Number(booking.provider_amount ?? 0);
  const serviceBill = Math.max(0, price - Number(booking.parts_amount ?? 0));
  const economics = requestEconomics({ price: serviceBill, launchActive: rt.launch.active });
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
      setSettlement(settleJob({ outcome: "completed", serviceBill, customerTotal: Number(booking.total_amount ?? price), wallet: walletSnapshot, launchActive: rt.launch.active }));
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
      {progress ? <Text className="text-sm font-semibold uppercase tracking-widest text-brand">Step {progress.current} of {progress.total}</Text> : null}
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

      {status === "pending" && isRequestOpen({ status, bookingDate: booking.booking_date, bookingTime: booking.booking_time }, new Date()) ? (
        <>
          <InfoBanner message="Review the problem, photos and voice note above, then decide. There is no timer: the customer is waiting for your answer." />
          <ErrorBanner message={blocked} />
          <Button label="Accept" loading={busy} disabled={!!blocked} onPress={() => void run("accept")} />
          {canDecline(status) ? <Button label="Decline" variant="secondary" disabled={busy} onPress={() => void decline()} /> : null}
        </>
      ) : status === "pending" ? (
        <Card><Body muted>The booked time has passed, so this request can no longer be accepted.</Body></Card>
      ) : null}

      {ACTIVE.includes(status) && step && isPatchAction(step.action) ? (
        <Button label={PROVIDER_ACTION_LABEL[step.action]} loading={busy} onPress={() => void run(step.action as PatchAction)} />
      ) : null}

      {["confirmed", "on_the_way", "arrived"].includes(status) ? (
        <Text className="text-xs text-muted">
          To finish, you will need the customer's {COMPLETION_CODE_LENGTH}-digit completion code (OTP). It is on their booking screen; ask for it only when the work is done.
        </Text>
      ) : null}

      {userId && (status === "in_progress" || status === "completed") ? <ProviderExtras bookingId={booking.id} status={status} userId={userId} /> : null}

      {status === "in_progress" && !settlement ? (
        <Card>
          <Text className="text-lg font-semibold text-fg">Finish the job</Text>
          <Body muted>Ask the customer for their {COMPLETION_CODE_LENGTH}-digit code once they are happy with the work.</Body>
          <TextField label="Customer's code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, "").slice(0, COMPLETION_CODE_LENGTH)); setCodeError(null); }}
            error={codeError ?? undefined} keyboardType="number-pad" maxLength={COMPLETION_CODE_LENGTH} autoComplete="off" />
          <Button label={PROVIDER_ACTION_LABEL.enter_code} loading={busy} onPress={() => void submitCode()} />
        </Card>
      ) : null}

      {settlement || status === "completed" ? (
        <Card>
          <Text className="text-lg font-semibold text-ok">Job completed</Text>
          <Line label="Final bill (customer pays you)" value={formatInr(Number(booking.total_amount ?? price))} />
          {Number(booking.parts_amount ?? 0) > 0 ? <Line label="Parts (no fee)" value={formatInr(Number(booking.parts_amount))} /> : null}
          {feeRecord.data ? (
            <>
              <Line label="Service bill for the fee" value={formatInr(feeRecord.data.service_bill)} />
              <Line label="HandyFix fee" value={feeRecord.data.waived > 0 ? `${formatInr(feeRecord.data.slab_fee)} waived` : formatInr(feeRecord.data.charged)} />
              {feeRecord.data.refunded > 0 ? <Line label="Fee returned" value={formatInr(feeRecord.data.refunded)} /> : null}
              <Line label="You keep" value={formatInr(Number(booking.total_amount ?? price) - feeRecord.data.charged + feeRecord.data.refunded)} strong />
            </>
          ) : settlement ? (
            <>
              <Line label="HandyFix fee" value={settlement.waived > 0 ? `${formatInr(settlement.slabFee)} waived` : formatInr(settlement.slabFee)} />
              <Line label="You keep" value={formatInr(settlement.providerNet)} strong />
            </>
          ) : null}
          {settlement && settlement.addedToDue > 0 ? <Text className="text-sm text-danger">Your wallet was short, so {formatInr(settlement.addedToDue)} was added to your dues. Top up to accept new jobs.</Text> : null}
          <Text className="text-xs text-muted">The customer can report a problem for 24 hours after completion (48 hours for repair quality). You can reply within 24 hours.</Text>
          <Button label={PROVIDER_ACTION_LABEL.done} onPress={() => router.replace("/provider/jobs")} />
        </Card>
      ) : null}

      {status === "completed" ? <ProviderDispute bookingId={booking.id} /> : null}

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
      {booking.special_instructions ? <Line label="Problem" value={booking.special_instructions} /> : null}
      <AttachmentGallery bookingId={booking.id} />
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
      <Text className={`flex-1 text-right text-base ${strong ? "font-bold text-brand" : "text-fg"}`}>{value}</Text>
    </View>
  );
}
