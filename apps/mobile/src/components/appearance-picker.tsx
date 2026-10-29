import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { useTheme, type Appearance } from "@/theme/theme";

const OPTIONS: { value: Appearance; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Profile > Appearance: Light / Dark / System (follows the phone). Saved on this device only. */
export function AppearancePicker() {
  const { appearance, setAppearance, colors } = useTheme();
  return (
    <View className="gap-2 rounded-panel border border-line bg-card p-4">
      <Text className="text-base font-semibold text-fg">Appearance</Text>
      <View accessibilityRole="radiogroup" className="flex-row gap-2">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = appearance === value;
          return (
            <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`Appearance: ${label}`}
              onPress={() => setAppearance(value)}
              className={`min-h-[64px] flex-1 items-center justify-center gap-1 rounded-tile border ${selected ? "border-brand bg-brand" : "border-line bg-tint"} active:opacity-80`}>
              <Icon size={20} color={selected ? colors.onBrand : colors.tintFg} />
              <Text className={`text-sm font-semibold ${selected ? "text-onbrand" : "text-tint-fg"}`}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs text-muted">System follows your phone's light or dark mode.</Text>
    </View>
  );
}
