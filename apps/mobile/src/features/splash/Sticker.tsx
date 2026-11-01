import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useThemeColors } from "@/theme/theme";

/**
 * A "sticker": a white rounded square around its content, with a soft drop shadow. Used for the logo on the opening screen
 * and for the three stickers of the login poster. Static: the motion lives in StickerMotion. The colours come from the
 * palette (put it inside DarkScope on a brand poster, so the shadow and canvas stay dark in the Light theme too).
 */
export function Sticker({ size, children, style }: { size: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: colors.white,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.canvas,
          shadowOpacity: 0.55,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
