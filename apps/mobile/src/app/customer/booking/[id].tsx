import { customerStatusLabel, formatBookingWhen, formatInr, quoteBooking, reconcileQuote, type BookingStatus } from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Body, Button, Card, ErrorBanner, InfoBanner, Screen, Title } from "@/components/ui";
import { cancelBooking, fetchBooking } from "@/features/customer/booking-api";

export default function BookingConfirmation() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id, expected } = useLocalSearchParams<{ id: string; expected?: string }>();
  const query = useQuery({ queryKey: ["booking", id], queryFn: () => fetchBooking(id), enabled: !!id });
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (query.isPending) return <Screen><Body muted>Loading…</Body></Screen>;
  if (query.isError || !query.data) {
    return (
      <Screen>
        <ErrorBanner message={query.isError ? "Could not load this booking." : "Booking not found."} />
        <Button label="Back to home" onPress={() => router.replace("/customer")} />
      </Screen>
    );
  }

  const { booking, serviceName, providerName } = query.data;
  const status = booking.status as BookingStatus;
  const proName = providerName ?? "your pro";

  // The database owns the price. Compare what it saved with what the customer was shown.
  const shown = expected ? Number(expected) : Number(booking.provider_amount ?? 0);
  const check = reconcileQuote(quoteBooking(shown), booking);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelBooking(booking.id);
      await queryClient.invalidateQueries({ queryKey: ["booking", id] });
      setConfirmingCancel(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel this booking.");
    } finally {
      setBusy(false);
    }
  };

  const open = status === "pending" || status === "confirmed";
  return (
    <Screen>
      <Text className="text-sm font-semibold uppercase tracking-widest text-gold">{status === "cancelled" ? "Cancelled" : "Booking requested"}</Text>
      <Title>{customerStatusLabel(status, providerName ?? undefined)}</Title>
      <ErrorBanner message={error} />

      {!check.matches ? (
        <View accessibilityRole="alert" className="gap-2 rounded-2xl border border-danger bg-danger/10 p-4">
          <Text className="text-base font-semibold text-danger">The saved price is different</Text>
          <Text className="text-sm text-danger">
            You were shown {formatInr(check.expectedTotal)}, but this booking was saved at {formatInr(check.storedTotal)}
            {check.storedFee > 0 ? ` (includes a ${formatInr(check.storedFee)} fee)` : ""}. Cancel it if you do not agree.
          </Text>
        </View>
      ) : null}

      <Card>
        <Line label="Service" value={booking.sub_item_name ?? serviceName ?? "Service"} />
        <Line label="Pro" value={providerName ?? "Finding your pro"} />
        <Line label="When" value={formatBookingWhen(booking.booking_date, booking.booking_time)} />
        <Line label="Where" value={[booking.address, booking.city, booking.pincode].filter(Boolean).join(", ")} />
      </Card>
      <Card>
        <Line label="Platform fee" value={formatInr(booking.platform_fee ?? 0)} />
        <Line label="Total" value={formatInr(booking.total_amount ?? 0)} strong />
      </Card>
      {open ? <InfoBanner message={`Pay ${proName} directly by UPI or cash after the service. Your pro has 30 seconds to accept; if not, we will offer you the next best pros.`} /> : null}

      <Button label="Back to home" onPress={() => router.replace("/customer")} />
      {open && !confirmingCancel ? <Button label="Cancel booking" variant="secondary" onPress={() => setConfirmingCancel(true)} /> : null}
      {open && confirmingCancel ? (
        <Card>
          <Text className="text-base font-semibold text-white">Cancel this booking?</Text>
          <Button label="Yes, cancel it" variant="danger" loading={busy} onPress={() => void cancel()} />
          <Button label="Keep booking" variant="secondary" onPress={() => setConfirmingCancel(false)} />
        </Card>
      ) : null}
    </Screen>
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
