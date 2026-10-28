import type { Tabs } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { useMemo, type ComponentProps } from "react";
import { StyleSheet, type ColorValue } from "react-native";
import { Glass } from "@/components/glass";
import { useThemeColors } from "@/theme/theme";

type BottomTabNavigationOptions = Exclude<NonNullable<ComponentProps<typeof Tabs>["screenOptions"]>, (...args: never[]) => unknown>;

/** Frosted bar behind the tabs (real blur on iOS/web, solid translucent fallback on Android). */
function TabBarBackground() {
  return <Glass tone="nav" intensity={50} style={StyleSheet.absoluteFill} />;
}

/** Shared bottom-tab look, following the theme: frosted bar, brand-blue active tab, line icons. */
export function useTabScreenOptions(): BottomTabNavigationOptions {
  const colors = useThemeColors();
  return useMemo(() => ({
    headerShown: false,
    tabBarStyle: { backgroundColor: "transparent", borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0, height: 72, paddingTop: 8, paddingBottom: 10 },
    tabBarBackground: TabBarBackground,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.mutedSoft,
    tabBarLabelStyle: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
    sceneStyle: { backgroundColor: "transparent" },
  }), [colors]);
}

export const tabIcon = (Icon: LucideIcon) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon color={String(color)} size={size} strokeWidth={1.9} />;
  };
