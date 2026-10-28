import { useId, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/theme/theme";

/**
 * The canvas plus two soft radial glows: blue top-left, amber lower-right (strong in Dark, very subtle in Light).
 * Drawn once with react-native-svg behind the content, never animated, and ignored by touches and screen readers.
 */
export function ScreenBackground({ children }: { children?: ReactNode }) {
  const { colors } = useTheme();
  const o = colors.glowOpacity;
  // Unique gradient ids: two screens can be mounted at once (web DOM ids are global).
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={`b${id}`} cx="8%" cy="4%" r="70%" fx="8%" fy="4%">
              <Stop offset="0" stopColor={colors.glowBlue} stopOpacity={o} />
              <Stop offset="1" stopColor={colors.glowBlue} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`a${id}`} cx="96%" cy="88%" r="60%" fx="96%" fy="88%">
              <Stop offset="0" stopColor={colors.glowAmber} stopOpacity={o * 0.6} />
              <Stop offset="1" stopColor={colors.glowAmber} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#b${id})`} />
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#a${id})`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}
