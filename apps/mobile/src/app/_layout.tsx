import "../global.css";
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import "../tasks/location-task";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0A" } }} />
    </SafeAreaProvider>
  );
}
