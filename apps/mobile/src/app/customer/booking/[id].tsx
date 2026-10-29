import {
  canPayOnline, customerCanCancel, customerStatusLabel, formatBookingWhen, formatInr, formatRating, isLateCancellation, needsAlternatives, paymentState, quoteBooking,
  reconcileQuote, requestOutcome, showsCompletionCode, showsLiveMap, trackingSummary, type BookingStatus,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react-native";
import { Linking, View } from "react-native";
import { Text } from "@/components/text";
import { TrackingMap } from "@/components/TrackingMap";
import { Body, Button, Card, ErrorBanner, HeroCard, InfoBanner, Screen, ScreenHeader, Title, ListSkeleton } from "@/components/ui";
import { useThemeColors } from "@/theme/theme";
import { AttachmentGallery } from "@/features/attachments/components";
import { ChatButton } from "@/features/chat/components";
import { ClosingProblemCard } from "@/features/closing/components";
import { loadCustomerProfile } from "@/features/auth/api";
import { useSession } from "@/features/auth/session-provider";
import {
  cancelBooking, fetchAlternatives, fetchBooking, fetchCompletionCode, fetchProviderLocation, fetchProviderPhone, rebookWithProvider,
  type BookingRow,
} from "@/features/customer/booking-api";
import type { ProviderListing } from "@/features/customer/types";
import { useBookingLive } from "@/features/customer/use-booking-live";
import { CustomerDispute } from "@/features/disputes/components";
import { BillCard, CustomerExtras, useExtras } from "@/features/extras/components";
import { BookingPayment } from "@/features/customer/booking-payment";
import { RateYourPro } from "@/features/reviews/components";

const FINISHED = ["completed", "cancelled"];

export default function BookingStatusScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, fullName } = useSession();
  const { id, expected, attachFailed, attachError } = useLocalSearchParams<{ id: string; expected?: string; attachFailed?: string; attachError?: string }>();

  const [now, setNow] = useState(new Date());
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [browseOthers, setBrowseOthers] = useState(false);

  const query = useQuery({
    queryKey: ["booking", id],
    enabled: !!id,
    queryFn: () => fetchBooking(id),
    // Realtime is the fast path; this poll is the safety net while the booking is unfinished.
    refetchInterval: (q) => (q.state.data && FINISHED.includes(q.state.data.booking.status) ? false : 8_000),
  });
  const booking = query.data?.booking;
  const status = (booking?.status ?? "pending") as BookingStatus;
  const live = !!booking && !FINISHED.includes(booking.status);
  useBookingLive(id, live);

  // "Last seen" ages tick every second while the booking is unfinished.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [live]);

  const outcome = booking
    ? requestOutcome({ status: booking.status, bookingDate: booking.booking_date, bookingTime: booking.booking_time, cancellationReason: booking.cancellation_reason }, now)
    : "waiting";
  const wantsAlternatives = needsAlternatives(outcome) || (outcome === "waiting" && browseOthers);

  const code = useQuery({
    queryKey: ["completion-code", id],
    enabled: !!booking && showsCompletionCode(status),
    queryFn: () => fetchCompletionCode(id),
    // Keep trying until a code is there (it is created with the booking; a slow trigger or network should not hide it).
    refetchInterval: (q) => (q.state.data ? false : 10_000),
  });
  const phone = useQuery({
    queryKey: ["provider-phone", id],
    enabled: !!booking && ["confirmed", "on_the_way", "arrived", "in_progress"].includes(status),
    queryFn: () => fetchProviderPhone(id),
    staleTime: 5 * 60_000,
  });
  const position = useQuery({
    queryKey: ["provider-location", id],
    enabled: !!booking && showsLiveMap(status),
    refetchInterval: 10_000,
    queryFn: () => fetchProviderLocation(id),
  });
  const alternatives = useQuery({
    queryKey: ["alternatives", id, outcome],
    enabled: !!booking && wantsAlternatives,
    queryFn: () => fetchAlternatives(booking!),
  });
  const profile = useQuery({ queryKey: ["customer-profile", userId], enabled: !!userId, queryFn: () => loadCustomerProfile(userId!) });
  const extras = useExtras(id, status);
  const pendingExtras = (extras.data ?? []).filter((e) => e.status === "pending").length;

  if (query.isPending) return <Screen><ScreenHeader title="Booking" onBack={() => router.replace("/customer/bookings")} /><ListSkeleton rows={4} /></Screen>;
  if (query.isError || !query.data || !booking) {
    return (
      <Screen>
        <ErrorBanner message={query.isError ? "Could not load this booking." : "Booking not found."} />
        <Button label="Back to home" onPress={() => router.replace("/customer")} />
      </Screen>
    );
  }

  const { serviceName, serviceSlug, providerName } = query.data;
  const pro = providerName?.split(" ")[0] ?? "your pro";
  const destination = booking.latitude != null && booking.longitude != null ? { latitude: Number(booking.latitude), longitude: Number(booking.longitude) } : null;
  const proPoint = position.data ? { latitude: position.data.latitude, longitude: position.data.longitude } : null;
  const tracking = trackingSummary({ pro: proPoint, destination, etaMinutes: booking.provider_eta_minutes, updatedAt: position.data?.updated_at, now });

  // The database owns the price. Compare what it saved with what the customer was shown.
  const shown = expected ? Number(expected) : Number(booking.provider_amount ?? 0);
  const check = reconcileQuote(quoteBooking(shown), booking);

  const title = (() => {
    if (outcome === "waiting") return `Waiting for ${pro}…`;
    if (outcome === "expired") return `${pro} did not answer`;
    if (outcome === "declined") return `${pro} is unavailable`;
    return customerStatusLabel(status, providerName ? pro : undefined);
  })();

  const lateCancel = isLateCancellation({ status: booking.status, bookingDate: booking.booking_date, bookingTime: booking.booking_time }, now);

  const cancel = async () => {
    setBusy("cancel");
    setError(null);
    try {
      await cancelBooking(booking.id, lateCancel);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["booking", id] }),
        queryClient.invalidateQueries({ queryKey: ["customer-bookings"] }),
      ]);
      setConfirmingCancel(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel this booking.");
    } finally {
      setBusy(null);
    }
  };

  const choose = async (candidate: ProviderListing) => {
    const offer = alternatives.data;
    if (!offer || !userId) return;
    setBusy(candidate.id);
    setError(null);
    setNotice(null);
    try {
      const result = await rebookWithProvider({
        userId, customerName: profile.data?.full_name ?? fullName, customerPhone: profile.data?.phone ?? null,
        old: booking, service: offer.service, subItem: offer.subItem, pro: candidate, now: new Date(),
      });
      if ("slotPassed" in result) {
        // The original time has gone by: pick a new time with the normal flow.
        router.push({ pathname: "/customer/book/[providerId]", params: { providerId: candidate.id, service: offer.service.slug, ...(offer.subItem ? { sub: offer.subItem.id } : {}) } });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["customer-bookings"] });
      router.replace({ pathname: "/customer/booking/[id]", params: { id: result.id, expected: String(candidate.price) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not book this pro.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Booking" onBack={() => router.replace("/customer/bookings")} />
      {status === "completed" ? (
        <View className="items-center gap-2 rounded-hero border border-ok/30 bg-ok-bg p-6">
          <CircleCheck size={44} color={colors.ok} />
          <Text className="text-sm font-semibold uppercase tracking-widest text-ok">{serviceName ?? "Service"}</Text>
          <Title>{title}</Title>
        </View>
      ) : (
        <HeroCard>
          <Text className="text-sm font-semibold uppercase tracking-widest text-brand">{serviceName ?? "Service"}</Text>
          <Title>{title}</Title>
        </HeroCard>
      )}
      <ErrorBanner message={error} />
      <InfoBanner message={notice} />

      {!check.matches ? (
        <View accessibilityRole="alert" className="gap-2 rounded-tile border border-danger bg-danger/10 p-4">
          <Text className="text-base font-semibold text-danger">The saved price is different</Text>
          <Text className="text-sm text-danger">
            You were shown {formatInr(check.expectedTotal)}, but this booking was saved at {formatInr(check.storedTotal)}
            {check.storedFee > 0 ? ` (includes a ${formatInr(check.storedFee)} fee)` : ""}. Cancel it if you do not agree.
          </Text>
        </View>
      ) : null}

      {outcome === "waiting" ? (
        <Card>
          <Text className="text-base font-semibold text-fg">Request sent to {pro}</Text>
          <Body muted>
            {pro} has been notified and is reviewing your details, photos and voice note. This screen updates as soon as they accept.
          </Body>
          {!browseOthers ? <Button label="Choose another pro instead" variant="secondary" onPress={() => setBrowseOthers(true)} /> : null}
        </Card>
      ) : null}

      {wantsAlternatives ? <Alternatives state={alternatives} busyId={busy} onChoose={(p) => void choose(p)} onBrowse={() => router.replace("/customer")} /> : null}

      {showsLiveMap(status) ? (
        <View className="gap-2">
          <TrackingMap pro={proPoint} destination={destination} />
          <Card>
            <Text className="text-lg font-semibold text-fg">
              {tracking.etaText ? `Arriving in about ${tracking.etaText}` : proPoint ? "Your pro is on the way" : "Waiting for your pro's location"}
            </Text>
            {tracking.distanceText ? <Text className="text-sm text-muted">{tracking.distanceText}</Text> : null}
            {tracking.stale ? <Text className="text-sm text-brand">Last seen {tracking.ageSeconds != null ? `${Math.max(1, Math.round(tracking.ageSeconds / 60))} min ago` : "a while ago"}. Their phone may be offline.</Text> : null}
          </Card>
        </View>
      ) : null}

      <ClosingProblemCard role="customer" bookingId={booking.id} status={status} startedAt={booking.started_at} otherName={providerName} />

      <CustomerExtras bookingId={booking.id} status={status} pro={pro} total={Number(booking.total_amount ?? 0)} />

      {showsCompletionCode(status) ? (
        <HeroCard>
          <Text className="text-sm font-semibold uppercase tracking-widest text-brand">Job completion code (OTP)</Text>
          {/* The four boxes show the digits but are hidden from screen readers; the transparent text on top is the code they
              read (and what is copied), as one number. */}
          <View className="self-start">
            <View className="flex-row gap-2" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {(code.data ?? "····").padEnd(4, "·").slice(0, 4).split("").map((d, i) => (
                <View key={i} className="h-16 w-14 items-center justify-center rounded-tile border-2 border-brand/50 bg-tint">
                  <Text className="text-3xl font-extrabold text-fg">{d}</Text>
                </View>
              ))}
            </View>
            <Text accessibilityLabel="Completion code" className="absolute inset-0 text-3xl font-extrabold" style={{ color: "transparent" }}>
              {code.data ?? "····"}
            </Text>
          </View>
          {code.data ? (
            <Text className="text-sm text-muted">
              Share this code with {pro} only when the work is done and you are happy. {pro} enters it to close the job. Never share it before.
            </Text>
          ) : (
            <Text className="text-sm text-danger">
              {code.isError ? "Could not load your code. Check your connection; we keep trying." : "Your code is not ready yet. We keep checking; contact support if it does not appear."}
            </Text>
          )}
        </HeroCard>
      ) : null}

      {["confirmed", "on_the_way", "arrived", "in_progress"].includes(status) ? (
        <Card>
          {phone.data ? <Button label={`Call ${pro}`} variant="secondary" onPress={() => void Linking.openURL(`tel:${phone.data}`)} /> : null}
          {booking.provider_id ? <ChatButton bookingId={booking.id} role="customer" status={status} otherName={pro} /> : null}
          <Text className="text-xs text-muted">{phone.data ? "Your pro's number is shared only for this booking." : "Calling and chat open once your pro is confirmed."}</Text>
        </Card>
      ) : null}
      {["completed", "cancelled"].includes(status) && booking.provider_id ? <ChatButton bookingId={booking.id} role="customer" status={status} otherName={pro} /> : null}

      <Card>
        <Line label="Service" value={booking.sub_item_name ?? serviceName ?? "Service"} />
        <Line label="Pro" value={providerName ?? "Finding your pro"} />
        <Line label="When" value={formatBookingWhen(booking.booking_date, booking.booking_time)} />
        <Line label="Where" value={[booking.address, booking.city, booking.pincode].filter(Boolean).join(", ")} />
        {booking.special_instructions ? <Line label="Problem" value={booking.special_instructions} /> : null}
        <AttachmentGallery bookingId={booking.id} />
      </Card>
      {attachFailed ? <ErrorBanner message={`${attachFailed} ${attachFailed === "1" ? "file" : "files"} could not be uploaded, so your pro cannot see ${attachFailed === "1" ? "it" : "them"}. Your booking is saved; describe the problem to your pro when they call.${attachError ? ` (Reason: ${attachError})` : ""}`} /> : null}
      <BillCard providerAmount={booking.provider_amount} rows={extras.data ?? []} payTo={status === "completed" ? pro : undefined} />

      {status === "completed" ? (
        <>
          {paymentState(booking.payment_status) === "paid" ? null : (
            <InfoBanner message={`All done. Pay ${pro} ${formatInr(booking.total_amount ?? 0)} directly by UPI or cash${canPayOnline(booking, pendingExtras) ? ", or pay online here" : ""}.`} />
          )}
          <BookingPayment booking={booking} pro={pro} serviceName={booking.sub_item_name ?? serviceName ?? "your booking"} pendingExtras={pendingExtras}
            refetch={async () => (await query.refetch()).data?.booking.payment_status} />
          <RateYourPro bookingId={booking.id} providerId={booking.provider_id} userId={userId} proName={pro}
            customerName={profile.data?.full_name ?? fullName} serviceName={booking.sub_item_name ?? serviceName ?? null} />
          <CustomerDispute bookingId={booking.id} completedAt={booking.completed_at} />
        </>
      ) : null}
      {outcome === "accepted" || outcome === "waiting" ? (
        <InfoBanner message={`Pay ${pro} directly by UPI or cash after the service.`} />
      ) : null}

      {status === "completed" && booking.provider_id && serviceSlug ? (
        <Button label={`Book ${pro} again`} variant="secondary" onPress={() => router.push({
          pathname: "/customer/book/[providerId]",
          params: { providerId: booking.provider_id!, service: serviceSlug, ...(booking.sub_item_id ? { sub: booking.sub_item_id } : {}) },
        })} />
      ) : null}
      {status === "cancelled" && serviceSlug ? (
        <Button label="Book again" variant="secondary" onPress={() => router.push({ pathname: "/customer/service/[slug]", params: { slug: serviceSlug } })} />
      ) : null}
      <Button label="Back to home" onPress={() => router.replace("/customer")} />
      {customerCanCancel(status) && !confirmingCancel ? <Button label="Cancel booking" variant="secondary" onPress={() => setConfirmingCancel(true)} /> : null}
      {customerCanCancel(status) && confirmingCancel ? (
        <Card>
          <Text className="text-base font-semibold text-fg">Cancel this booking?</Text>
          {lateCancel ? (
            <Text className="text-sm text-danger">
              {pro} has already accepted and the start is less than 2 hours away, so this counts as a late cancellation. 3 late cancellations in 30 days pause instant booking for a week.
            </Text>
          ) : <Text className="text-sm text-muted">Cancelling is free.</Text>}
          <Button label="Yes, cancel it" variant="danger" loading={busy === "cancel"} onPress={() => void cancel()} />
          <Button label="Keep booking" variant="secondary" onPress={() => setConfirmingCancel(false)} />
        </Card>
      ) : null}
    </Screen>
  );
}

function Alternatives({
  state, busyId, onChoose, onBrowse,
}: {
  state: { isPending: boolean; isError: boolean; data: Awaited<ReturnType<typeof fetchAlternatives>> | undefined; refetch: () => unknown };
  busyId: string | null;
  onChoose: (p: ProviderListing) => void;
  onBrowse: () => void;
}) {
  const pros = state.data?.pros ?? [];
  return (
    <View className="gap-3">
      <Text className="text-lg font-semibold text-fg">Next best pros for the same time</Text>
      {state.isPending ? <Body muted>Finding other pros…</Body> : null}
      {state.isError ? <ErrorBanner message="Could not load other pros." /> : null}
      {!state.isPending && pros.length === 0 ? (
        <Card>
          <Body muted>No other pro is online for this job right now.</Body>
          <Button label="Try again" variant="secondary" onPress={() => void state.refetch()} />
          <Button label="Browse services" variant="secondary" onPress={onBrowse} />
        </Card>
      ) : null}
      {pros.map((p) => (
        <View key={p.id} className="gap-2 rounded-tile border border-line bg-card p-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-fg">{p.fullName}{p.isVerified ? "  ✓" : ""}</Text>
              <Text className="text-sm text-muted">★ {formatRating(p.rating)}{p.totalReviews ? ` (${p.totalReviews})` : ""} · {p.totalJobs} jobs</Text>
            </View>
            <Text className="text-2xl font-bold text-brand">{formatInr(p.price)}</Text>
          </View>
          <Button label={`Book ${p.fullName.split(" ")[0]}`} loading={busyId === p.id} disabled={busyId !== null && busyId !== p.id} onPress={() => onChoose(p)} />
        </View>
      ))}
    </View>
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
