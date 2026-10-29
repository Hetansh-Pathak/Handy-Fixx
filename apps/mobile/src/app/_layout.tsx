import "../global.css";
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import "../tasks/location-task";
import "../tasks/provider-tasks";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { variantAllowsRole } from "@handyfix/shared";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/features/auth/session-provider";
import { PushHandler } from "@/features/push/push-handler";
import { Button, FullScreenMessage } from "@/components/ui";
import { env } from "@/lib/env";
import { queryClient } from "@/lib/query-client";
import { ThemeProvider, useThemeColors } from "@/theme/theme";

void SplashScreen.preventAutoHideAsync();

function Navigator() {
  const colors = useThemeColors();
  const { status, role, errorMessage, refresh, signOut } = useSession();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  });
  const fontsReady = fontsLoaded || !!fontError; // never block the app on a font

  useEffect(() => {
    if (status !== "loading" && fontsReady) void SplashScreen.hideAsync();
  }, [status, fontsReady]);

  if (status === "loading" || !fontsReady) return null; // native splash stays up

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
  // A pro opening the customer app (or the reverse) is pointed to the right app instead of a broken screen.
  if (signedIn && role && !variantAllowsRole(env.appVariant, role)) {
    const isProAccount = role === "provider";
    const otherUrl = isProAccount ? env.proAppUrl : env.customerAppUrl;
    return (
      <FullScreenMessage
        title={isProAccount ? "This is a pro account" : "This is a customer account"}
        message={isProAccount
          ? "Pros use the HandyFix Pro app. To book services, sign out and use a different email in this app."
          : "Customers use the HandyFix app. To work as a pro, sign out and register a different email in this app."}
      >
        {otherUrl ? <Button label={isProAccount ? "Open HandyFix Pro" : "Open HandyFix"} onPress={() => void Linking.openURL(otherUrl)} /> : null}
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      </FullScreenMessage>
    );
  }
  return (
    <>
    {signedIn && role ? <PushHandler /> : null}
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
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
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <Navigator />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
