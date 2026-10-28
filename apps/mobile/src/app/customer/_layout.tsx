import { Stack } from "expo-router";
import { AreaProvider } from "@/features/customer/area-context";
import { useThemeColors } from "@/theme/theme";

/** Stack around the tabs so service, booking and confirmation screens open full-screen on top of them. */
export default function CustomerLayout() {
  const colors = useThemeColors();
  return (
    <AreaProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AreaProvider>
  );
}
