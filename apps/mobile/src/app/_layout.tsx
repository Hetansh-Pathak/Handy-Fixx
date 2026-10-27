import "../global.css";
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import "../tasks/location-task";
import "../tasks/provider-tasks";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/features/auth/session-provider";
import { Button, FullScreenMessage } from "@/components/ui";
import { env } from "@/lib/env";
import { queryClient } from "@/lib/query-client";

void SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { status, role, errorMessage, refresh, signOut } = useSession();

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);

  if (status === "loading") return null; // native splash stays up

  if (status === "misconfigured") {
    return <FullScreenMessage title="App not configured" message={errorMessage ?? "Missing Supabase settings."} />;
  }
  if (status === "error") {
    return (
      <FullScreenMessage title="Can't reach HandyFix" message="Check your internet connection and try again.">
        <Button label="Try again" onPress={() => void refresh()} />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      </FullScreenMessage>
    );
  }

  const signedIn = status === "ready";
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0A0A" } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !role} redirectTo="/sign-in">
        <Stack.Screen name="role-pick" />
      </Stack.Protected>
      <Stack.Protected guard={role === "customer"} redirectTo="/sign-in">
        <Stack.Screen name="customer" />
      </Stack.Protected>
      <Stack.Protected guard={role === "provider"} redirectTo="/sign-in">
        <Stack.Screen name="provider" />
      </Stack.Protected>
      <Stack.Protected guard={env.spikeEnabled}>
        <Stack.Screen name="(dev)" />
      </Stack.Protected>
      {/* Opened from the emailed link, whether or not anyone is signed in. */}
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Navigator />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
