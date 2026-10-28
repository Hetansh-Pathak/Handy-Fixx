import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Body, Button, Screen, ScreenHeader } from "@/components/ui";
import { ChatScreen } from "@/features/chat/components";
import { fetchBooking } from "@/features/customer/booking-api";

export default function CustomerChat() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/customer/booking/${bookingId}`));
  const booking = useQuery({ queryKey: ["booking", bookingId], enabled: !!bookingId, queryFn: () => fetchBooking(bookingId) });
  if (booking.isPending) return <Screen><ScreenHeader title="Chat" onBack={back} /><Body muted>Loading…</Body></Screen>;
  if (booking.isError || !booking.data) {
    return <Screen><ScreenHeader title="Chat" onBack={back} /><Body muted>Could not open this chat.</Body><Button label="Try again" onPress={() => void booking.refetch()} /></Screen>;
  }
  const pro = booking.data.providerName?.split(" ")[0] ?? "your pro";
  return <ChatScreen bookingId={bookingId} role="customer" status={booking.data.booking.status} otherName={pro} onBack={back} />;
}
