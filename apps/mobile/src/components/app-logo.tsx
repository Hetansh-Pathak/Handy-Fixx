import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Text } from "@/components/text";
import { useTheme } from "@/theme/theme";
import { APNABANDA_ICON_SVG } from "./logo-svg";

/** Just the hard-hat icon tile. */
export function AppIcon({ size = 36 }: { size?: number }) {
  // The wrapper (not the SVG) carries the hide-from-screen-readers props: react-native-svg passes unknown props to the
  // DOM on web, which React warns about.
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={APNABANDA_ICON_SVG} width={size} height={size} />
    </View>
  );
}

/**
 * The apnabanda logo. Customer app: icon + "apna" (text colour) + "banda" (brand blue), weight 800, tight tracking.
 * Pro app (`pro`): a dark pill with the icon, "apnabanda" in white and an amber PRO badge.
 */
export function AppLogo({ size = 36, pro = false }: { size?: number; pro?: boolean }) {
  const { scheme } = useTheme();
  const wordSize = Math.round(size * 0.62);

  if (pro) {
    return (
      <View accessibilityRole="image" accessibilityLabel="apnabanda Pro"
        className="flex-row items-center gap-2 self-start rounded-full py-1.5 pl-1.5 pr-2"
        style={scheme === "dark"
          ? { backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" }
          : { backgroundColor: "#0B1B3A" }}>
        <AppIcon size={size} />
        <Text className="font-extrabold tracking-tight" style={{ fontSize: wordSize, color: "#FFFFFF", letterSpacing: -0.5 }}>apnabanda</Text>
        <View className="justify-center px-2" style={{ backgroundColor: "#FFC233", borderRadius: 8, minHeight: 22 }}>
          <Text className="font-bold" style={{ fontSize: 12, color: "#1A1100" }}>PRO</Text>
        </View>
      </View>
    );
  }

  return (
    <View accessibilityRole="image" accessibilityLabel="apnabanda" className="flex-row items-center gap-2">
      <AppIcon size={size} />
      <Text className="font-extrabold tracking-tight text-fg" style={{ fontSize: wordSize, letterSpacing: -0.5 }}>
        apna<Text className="font-extrabold text-brand" style={{ fontSize: wordSize, letterSpacing: -0.5 }}>banda</Text>
      </Text>
    </View>
  );
}
