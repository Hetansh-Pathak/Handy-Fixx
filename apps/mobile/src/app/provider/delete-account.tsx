import { useQuery } from "@tanstack/react-query";
import { Body, Screen, ScreenHeader } from "@/components/ui";
import { DeleteAccountScreen } from "@/features/account/delete-account";
import { useSession } from "@/features/auth/session-provider";
import { fetchProviderBookings } from "@/features/provider/api";
import { useProviderRuntime } from "@/features/provider/provider-runtime";

const ACTIVE = ["pending", "confirmed", "on_the_way", "arrived", "in_progress"];

import { useRouter } from "expo-router";
export default function ProviderDeleteAccount() {
  const router = useRouter();
  const { provider } = useSession();
  const rt = useProviderRuntime();
  const bookings = useQuery({ queryKey: ["provider-bookings", provider?.id], enabled: !!provider?.id, queryFn: () => fetchProviderBookings(provider!.id) });
  if (bookings.isPending) return <Screen><ScreenHeader title="Delete account" onBack={() => router.back()} /><Body muted>Checking your jobs…</Body></Screen>;
  const active = (bookings.data ?? []).filter((b) => ACTIVE.includes(b.status)).length;
  return <DeleteAccountScreen role="provider" activeBookings={active} walletBalance={rt.wallet.balance} walletDue={rt.wallet.due} />;
}
