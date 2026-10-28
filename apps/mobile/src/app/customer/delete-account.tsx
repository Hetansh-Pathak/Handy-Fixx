import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session-provider";
import { fetchCustomerBookings } from "@/features/customer/booking-api";
import { DeleteAccountScreen } from "@/features/account/delete-account";
import { Body, Screen, ScreenHeader } from "@/components/ui";

const ACTIVE = ["pending", "confirmed", "on_the_way", "arrived", "in_progress"];

export default function CustomerDeleteAccount() {
  const { userId } = useSession();
  const bookings = useQuery({ queryKey: ["customer-bookings", userId], enabled: !!userId, queryFn: () => fetchCustomerBookings(userId!) });
  if (bookings.isPending) return <Screen><ScreenHeader title="Delete account" onBack={() => undefined} /><Body muted>Checking your bookings…</Body></Screen>;
  const active = (bookings.data ?? []).filter((b) => ACTIVE.includes(b.status)).length;
  return <DeleteAccountScreen role="customer" activeBookings={active} />;
}
