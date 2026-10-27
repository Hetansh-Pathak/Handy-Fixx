import { Stack } from "expo-router";
import { AreaProvider } from "@/features/customer/area-context";

/** Stack around the tabs so service, booking and confirmation screens open full-screen on top of them. */
export default function CustomerLayout() {
  return (
    <AreaProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FAF6EF" } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AreaProvider>
  );
}
