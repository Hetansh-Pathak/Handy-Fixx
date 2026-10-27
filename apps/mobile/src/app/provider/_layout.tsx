import { Stack } from "expo-router";
import { Button, FullScreenMessage } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { ProviderRuntime } from "@/features/provider/provider-runtime";

export default function ProviderLayout() {
  const { provider, signOut } = useSession();

  // A suspended pro is locked out of the app (same rule as the old provider portal).
  if (provider?.status === "suspended") {
    return (
      <FullScreenMessage title="Account suspended" message="Your account has been suspended. Contact HandyFix support for help.">
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      </FullScreenMessage>
    );
  }

  // The runtime owns online status, the heartbeat and the incoming-request alert for every provider screen.
  return (
    <ProviderRuntime>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FAF6EF" } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="wallet" />
      </Stack>
    </ProviderRuntime>
  );
}
