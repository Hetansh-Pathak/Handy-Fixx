import { shouldShowSplash } from "@handyfix/shared";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSession } from "@/features/auth/session-provider";
import { env } from "@/lib/env";
import { AnimatedSplash } from "./AnimatedSplash";

/** The JS process outlives a trip to the background, so a module flag means "cold start only". */
let played = false;

/**
 * Puts the animated opening screen over the app. The app underneath loads as usual; the splash leaves when its animation is
 * done AND the app is ready (session known, fonts loaded). When the splash is off (already played, or EXPO_PUBLIC_SKIP_SPLASH=1)
 * the native splash is hidden as soon as the app is ready, exactly as before.
 */
export function SplashHost({ fontsReady, children }: { fontsReady: boolean; children: ReactNode }) {
  const { status } = useSession();
  const ready = status !== "loading" && fontsReady;
  const [enabled] = useState(() => shouldShowSplash({ alreadyShown: played, skip: env.skipSplash }));
  const [visible, setVisible] = useState(enabled);

  useEffect(() => {
    if (enabled) played = true;
  }, [enabled]);

  useEffect(() => {
    if (!enabled && ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [enabled, ready]);

  const done = useCallback(() => setVisible(false), []);

  return (
    <>
      {children}
      {visible ? <AnimatedSplash ready={ready} fontsReady={fontsReady} onDone={done} /> : null}
    </>
  );
}
