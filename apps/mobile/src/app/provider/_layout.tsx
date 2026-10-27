import { Tabs } from "expo-router";
import { Button, FullScreenMessage } from "@/components/ui";
import { tabScreenOptions } from "@/components/tab-options";
import { useSession } from "@/features/auth/session-provider";

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

  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="jobs" options={{ title: "Jobs" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
