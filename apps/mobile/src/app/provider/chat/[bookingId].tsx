import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Body, Button, Screen, ScreenHeader } from "@/components/ui";
import { ChatScreen } from "@/features/chat/components";
import { fetchProviderBooking } from "@/features/provider/api";

export default function ProviderChat() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/provider/job/${bookingId}`));
  const booking = useQuery({ queryKey: ["provider-booking", bookingId], enabled: !!bookingId, queryFn: () => fetchProviderBooking(bookingId) });
  if (booking.isPending) return <Screen><ScreenHeader title="Chat" onBack={back} /><Body muted>Loading…</Body></Screen>;
  if (booking.isError || !booking.data) {
    return <Screen><ScreenHeader title="Chat" onBack={back} /><Body muted>Could not open this chat.</Body><Button label="Try again" onPress={() => void booking.refetch()} /></Screen>;
  }
  const customer = booking.data.customer_name?.split(" ")[0] ?? "the customer";
  return <ChatScreen bookingId={bookingId} role="provider" status={booking.data.status} otherName={customer} onBack={back} />;
}
