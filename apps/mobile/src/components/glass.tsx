import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/theme";

/**
 * Frosted surface for the few places that get blur (bottom nav, top hero/status cards, sheets and dialogs).
 * Ordinary list cards must NOT use this: they are a translucent card colour plus a border.
 *
 * Blur is real on iOS, and on web when the browser supports backdrop-filter. Android blur is expensive and
 * unreliable on low-end phones, so Android (and any web browser without backdrop-filter) gets the solid
 * translucent fallback: the same tint, a little more opaque, no blur. Blur is never animated.
 */
const webBlurSupported =
  Platform.OS === "web" && typeof CSS !== "undefined" && typeof CSS.supports === "function" &&
  (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)"));

export const blurSupported = Platform.OS === "ios" || webBlurSupported;

export type GlassTone = "nav" | "card" | "sheet";

export function Glass({ children, tone = "card", intensity = 40, className, style }: {
  children?: ReactNode;
  tone?: GlassTone;
  /** 0-100. Keep it modest: high intensity costs frames. */
  intensity?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { scheme, colors } = useTheme();
  const dark = scheme === "dark";
  // The colour laid over the blur (or used alone as the fallback).
  const overlay = {
    nav: colors.nav,
    card: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.78)",
    sheet: dark ? "rgba(14,18,30,0.86)" : "rgba(255,255,255,0.94)",
  }[tone];
  const fallback = {
    nav: dark ? "rgba(12,16,28,0.96)" : "rgba(255,255,255,0.98)",
    card: dark ? "rgba(22,27,40,0.92)" : "#FFFFFF",
    sheet: dark ? "rgba(14,18,30,0.98)" : "#FFFFFF",
  }[tone];

  if (!blurSupported) {
    return <View className={className} style={[{ backgroundColor: fallback, overflow: "hidden" }, style]}>{children}</View>;
  }
  return (
    <View className={className} style={[{ overflow: "hidden", zIndex: 0 }, style]}>
      {/* zIndex -1 keeps the frost behind every child (on web a positioned layer would otherwise paint over a TextInput). */}
      <BlurView intensity={intensity} tint={dark ? "dark" : "light"} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay, zIndex: -1 }]} />
      {children}
    </View>
  );
}
