import { APP_NAME, APP_NAME_PRO, brandCopy } from "@handyfix/shared";
import { Paintbrush, Wrench } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Keyboard, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/app-logo";
import { Glass } from "@/components/glass";
import { ScreenBackground } from "@/components/screen-background";
import { Text } from "@/components/text";
import { env } from "@/lib/env";
import { Sticker } from "@/features/splash/Sticker";
import { StickerPop, StickerSlap } from "@/features/splash/StickerMotion";
import { DarkScope, useThemeColors } from "@/theme/theme";

/**
 * The "Black + Blur sticker collage" poster above the sign-in form. A brand poster: always dark, in the Light theme too
 * (DarkScope). Static glows, a static frosted pill; only the stickers move (pop in one after another, the logo last with a
 * short slap), and not at all with reduced motion. The words come from BRAND_COPY.
 */

/** True while the on-screen keyboard is open (native), or while the window is too short for the full poster (Android resizes the window). */
export function usePosterCompact(forceCompact: boolean): boolean {
  const { height } = useWindowDimensions();
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return forceCompact || keyboard || height < 520;
}

function Headline({ size, lineHeight }: { size: number; lineHeight: number }) {
  const copy = brandCopy(env.appVariant);
  const h = copy.posterHeadline;
  return (
    <Text accessibilityRole="header" className="font-extrabold text-fg" style={{ fontSize: size, lineHeight, letterSpacing: -0.5 }}>
      {h.before}<Text className="font-extrabold text-accent" style={{ fontSize: size, lineHeight, letterSpacing: -0.5 }}>{h.accent}</Text>{h.after}
    </Text>
  );
}

function Collage({ reduced }: { reduced: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <View style={{ marginRight: -14 }}>
        <StickerPop restRotate={-14} delay={0} reduced={reduced}>
          <Sticker size={64}><Wrench size={30} color={colors.brand} strokeWidth={2.2} /></Sticker>
        </StickerPop>
      </View>
      <View style={{ zIndex: 2 }}>
        <StickerSlap restRotate={-4} delay={200} reduced={reduced}>
          <Sticker size={96}><AppIcon size={76} /></Sticker>
        </StickerSlap>
      </View>
      <View style={{ marginLeft: -14 }}>
        <StickerPop restRotate={12} delay={100} reduced={reduced}>
          <Sticker size={64}><Paintbrush size={30} color={colors.onAccent} strokeWidth={2.2} /></Sticker>
        </StickerPop>
      </View>
    </View>
  );
}

/** `compact`: the logo sticker and the headline only (the sign-up and reset forms are long, and so is a small phone with the keyboard open). */
export function AuthPoster({ compact: wantsCompact = false }: { compact?: boolean }) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = usePosterCompact(wantsCompact);
  const copy = brandCopy(env.appVariant);
  const pad = 20;

  return (
    <DarkScope style={{ overflow: "hidden", borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}><ScreenBackground /></View>
      <View
        accessibilityLabel={env.appVariant === "provider" ? APP_NAME_PRO : APP_NAME}
        style={compact
          ? { paddingTop: insets.top + 14, paddingBottom: 18, paddingHorizontal: pad, flexDirection: "row", alignItems: "center", gap: 14 }
          : { minHeight: Math.min(Math.max(Math.round(height * 0.55), 330), 430), paddingTop: insets.top + 22, paddingBottom: 26, paddingHorizontal: pad, gap: 10 }}
      >
        {compact ? (
          <>
            <StickerSlap restRotate={-4} delay={0} reduced={reduced}>
              <Sticker size={56}><AppIcon size={44} /></Sticker>
            </StickerSlap>
            <View style={{ flex: 1 }}><Headline size={21} lineHeight={25} /></View>
          </>
        ) : (
          <>
            <Headline size={28} lineHeight={32} />
            <Text className="text-muted" style={{ fontSize: 13, lineHeight: 18 }}>{copy.posterSubline}</Text>
            <View style={{ flex: 1, minHeight: 12 }} />
            <Collage reduced={reduced} />
            <View style={{ alignItems: "center", paddingTop: 6 }}>
              <Glass tone="card" intensity={30} className="rounded-full border border-line px-4 py-2">
                <Text className="text-xs font-semibold text-fg">{copy.posterPill}</Text>
              </Glass>
            </View>
          </>
        )}
      </View>
    </DarkScope>
  );
}
