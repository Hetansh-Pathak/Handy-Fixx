import { APP_NAME, APP_NAME_PRO, APP_WORDMARK, brandCopy, SPLASH_FADE_MS, splashState, type SplashState } from "@handyfix/shared";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { AppIcon, AppLogo } from "@/components/app-logo";
import { Glass } from "@/components/glass";
import { ScreenBackground } from "@/components/screen-background";
import { Text } from "@/components/text";
import { env } from "@/lib/env";
import { DarkScope, useThemeColors } from "@/theme/theme";
import { Sticker } from "./Sticker";
import { StickerSlap } from "./StickerMotion";

/**
 * The opening screen, "Black + Blur slap" (about 2.5 s). Always dark, even in the Light theme. Timeline (ms from mount):
 *   0     glows drift into place (transform only)
 *   200   the logo sticker slaps down from above and lands at -5 deg with an overshoot
 *   800   first ring pulses out from behind it, 1000 the second
 *   850   a short shake, as if stuck on
 *   1200  the wordmark fades and scales in (no blur filter: blur is never animated)
 *   1600  the tagline fades up
 *   2000  the pill fades up (customer: frosted pill; Pro: the dark PRO logo pill)
 * It plays WHILE the app loads and leaves when the animation is done AND the app is ready (splashState), with a 200 ms fade.
 * Reduced motion: the final frame at once, held for about 600 ms.
 */
const STICKER = 124;
const REST_ROTATE = -5;

function Ring({ delay, reduced }: { delay: number; reduced: boolean }) {
  const colors = useThemeColors();
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    scale.value = withDelay(delay, withTiming(2.1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    // hidden until its moment, then 0.9 -> 0 as it grows
    opacity.value = withDelay(delay, withSequence(withTiming(0.9, { duration: 1 }), withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) })));
  }, [reduced, delay, scale, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: STICKER, height: STICKER, borderRadius: Math.round(STICKER * 0.28), borderWidth: 3, borderColor: colors.brand }, style]}
    />
  );
}

/** Fades in and moves up a little (or just fades) from `delay`. */
function FadeUp({ delay, duration, rise = 12, grow = 1, reduced, children }: { delay: number; duration: number; rise?: number; grow?: number; reduced: boolean; children: ReactNode }) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [reduced, delay, duration, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * rise }, { scale: grow + (1 - grow) * p.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Shown only if the app is still loading after 3.5 s: the final frame stays and this small spinner appears. */
function SplashSpinner() {
  const colors = useThemeColors();
  return (
    <View pointerEvents="none" style={{ position: "absolute", bottom: 56, left: 0, right: 0, alignItems: "center" }}>
      <ActivityIndicator accessibilityLabel="Loading" color={colors.brand} />
    </View>
  );
}

export function AnimatedSplash({ ready, fontsReady, onDone }: { ready: boolean; fontsReady: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const copy = brandCopy(env.appVariant);
  const isPro = env.appVariant === "provider";
  const [state, setState] = useState<SplashState>({ phase: "playing", showSpinner: false });
  const startedAt = useRef(Date.now());
  const glow = useSharedValue(reduced ? 1 : 0);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (!reduced) glow.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [reduced, glow]);

  // The clock: a cheap 100 ms check; the screen re-renders only when the phase changes.
  useEffect(() => {
    const id = setInterval(() => {
      const next = splashState({ elapsedMs: Date.now() - startedAt.current, ready, reducedMotion: reduced });
      setState((prev) => (prev.phase === next.phase && prev.showSpinner === next.showSpinner ? prev : next));
    }, 100);
    return () => clearInterval(id);
  }, [ready, reduced]);

  // Leave: fade out, then unmount.
  useEffect(() => {
    if (state.phase !== "leave") return;
    fade.value = withTiming(0, { duration: SPLASH_FADE_MS });
    const id = setTimeout(onDone, SPLASH_FADE_MS + 30);
    return () => clearTimeout(id);
  }, [state.phase, fade, onDone]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - glow.value) * -24 }, { translateY: (1 - glow.value) * -24 }, { scale: 1.06 - 0.06 * glow.value }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, rootStyle, { zIndex: 1000 }]}
      // The first frame is on screen: the native splash (same canvas colour) can go, so there is no white flash.
      onLayout={() => void SplashScreen.hideAsync().catch(() => undefined)}
      testID="animated-splash"
      accessible
      accessibilityLabel={isPro ? APP_NAME_PRO : APP_NAME}
      accessibilityViewIsModal
    >
      <DarkScope style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
          <ScreenBackground />
        </Animated.View>
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", gap: 18, padding: 24 }]}>
          <View style={{ width: STICKER, height: STICKER, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
            <Ring delay={800} reduced={reduced} />
            <Ring delay={1000} reduced={reduced} />
            <StickerSlap restRotate={REST_ROTATE} delay={200} far shakeAt={850} reduced={reduced}>
              <Sticker size={STICKER}><AppIcon size={STICKER - 24} /></Sticker>
            </StickerSlap>
          </View>

          {fontsReady ? (
            <>
              <FadeUp delay={1200} duration={500} rise={0} grow={0.9} reduced={reduced}>
                <Text className="text-5xl font-extrabold tracking-tight text-fg" style={{ letterSpacing: -1.5 }}>
                  {APP_WORDMARK[0]}<Text className="text-5xl font-extrabold text-accent" style={{ letterSpacing: -1.5 }}>{APP_WORDMARK[1]}</Text>
                </Text>
              </FadeUp>
              <FadeUp delay={1600} duration={400} reduced={reduced}>
                <Text className="text-center text-lg font-semibold text-muted">{copy.splashTagline}</Text>
              </FadeUp>
              <FadeUp delay={2000} duration={400} reduced={reduced}>
                {isPro ? (
                  <AppLogo pro size={30} />
                ) : copy.splashPill ? (
                  <Glass tone="card" intensity={30} className="rounded-full border border-line px-5 py-2.5">
                    <Text className="text-sm font-semibold text-fg">{copy.splashPill}</Text>
                  </Glass>
                ) : null}
              </FadeUp>
            </>
          ) : null}
        </View>
        {state.showSpinner ? <SplashSpinner /> : null}
      </DarkScope>
    </Animated.View>
  );
}
