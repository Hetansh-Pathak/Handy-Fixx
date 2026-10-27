import { Redirect, Stack } from "expo-router";
import { env } from "@/lib/env";

export default function DevLayout() {
  if (!env.spikeEnabled) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0A" } }} />;
}
