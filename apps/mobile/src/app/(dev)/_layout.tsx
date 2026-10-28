import { Redirect, Stack } from "expo-router";
import { env } from "@/lib/env";
import { useThemeColors } from "@/theme/theme";

export default function DevLayout() {
  const colors = useThemeColors();
  if (!env.spikeEnabled) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />;
}
