import { customerStatusLabel, formatBookingWhen, formatInr, groupBookings, type BookingStatus } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { Body, ErrorBanner, Screen, Title, ListSkeleton } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { fetchCustomerBookings, type CustomerBookingListItem } from "@/features/customer/booking-api";

export default function CustomerBookings() {
  const router = useRouter();
  const { userId } = useSession();
  const query = useQuery({
    queryKey: ["customer-bookings", userId],
    enabled: !!userId,
    refetchInterval: 15_000,
    queryFn: () => fetchCustomerBookings(userId!),
  });
  const groups = groupBookings(query.data ?? []);

  return (
    <Screen>
      <Title>Your bookings</Title>
      <ErrorBanner message={query.isError ? "Could not load your bookings." : null} />
      {query.isPending ? <ListSkeleton /> : null}
      {query.isSuccess && (query.data?.length ?? 0) === 0 ? <Body muted>No bookings yet. Pick a service on Home to book your first pro.</Body> : null}
      {groups.active.length > 0 ? <Text className="text-lg font-semibold text-fg">In progress</Text> : null}
      {groups.active.map((b) => <Row key={b.id} b={b} onPress={() => router.push({ pathname: "/customer/booking/[id]", params: { id: b.id } })} />)}
      {groups.past.length > 0 ? <Text className="mt-2 text-lg font-semibold text-fg">Past</Text> : null}
      {groups.past.map((b) => <Row key={b.id} b={b} onPress={() => router.push({ pathname: "/customer/booking/[id]", params: { id: b.id } })} />)}
    </Screen>
  );
}

function Row({ b, onPress }: { b: CustomerBookingListItem; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Booking ${b.sub_item_name ?? b.serviceName ?? ""}`} onPress={onPress}
      className="gap-1 rounded-tile border border-line bg-card p-4 active:opacity-80">
      <View className="flex-row justify-between gap-3">
        <Text className="flex-1 text-lg font-semibold text-fg">{b.sub_item_name ?? b.serviceName ?? "Service"}</Text>
        <Text className="text-lg font-bold text-brand">{formatInr(b.total_amount ?? 0)}</Text>
      </View>
      <Text className="text-sm text-muted">{formatBookingWhen(b.booking_date, b.booking_time)}{b.providerName ? ` · ${b.providerName}` : ""}</Text>
      <Text className="text-sm text-brand">{customerStatusLabel(b.status as BookingStatus, b.providerName?.split(" ")[0])}</Text>
    </Pressable>
  );
}
