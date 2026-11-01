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
import { variantAllowsRole } from "@handyfix/shared";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/features/auth/session-provider";
import { PushHandler } from "@/features/push/push-handler";
import { SplashHost } from "@/features/splash/splash-host";
import { Button, FullScreenMessage } from "@/components/ui";
import { env } from "@/lib/env";
import { queryClient } from "@/lib/query-client";
import { ThemeProvider, useThemeColors } from "@/theme/theme";

void SplashScreen.preventAutoHideAsync();

function Navigator({ fontsReady }: { fontsReady: boolean }) {
  const colors = useThemeColors();
  const { status, role, errorMessage, refresh, signOut } = useSession();

  // The opening screen (or, when it is off, the native splash) stays up until the session is known and the fonts are loaded.
  if (status === "loading" || !fontsReady) return null;

  if (status === "misconfigured") {
    return <FullScreenMessage title="App not configured" message={errorMessage ?? "Missing Supabase settings."} />;
  }
  if (status === "error") {
    return (
      <FullScreenMessage title="Can't reach apnabanda" message="Check your internet connection and try again.">
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
          ? "Pros use the apnabanda Pro app. To book services, sign out and use a different email in this app."
          : "Customers use the apnabanda app. To work as a pro, sign out and register a different email in this app."}
      >
        {otherUrl ? <Button label={isProAccount ? "Open apnabanda Pro" : "Open apnabanda"} onPress={() => void Linking.openURL(otherUrl)} /> : null}
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
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  });
  const fontsReady = fontsLoaded || !!fontError; // never block the app on a font
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <SplashHost fontsReady={fontsReady}>
              <Navigator fontsReady={fontsReady} />
            </SplashHost>
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
