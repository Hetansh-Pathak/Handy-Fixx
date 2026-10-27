import type { LucideIcon } from "lucide-react-native";
import type { ColorValue } from "react-native";
import { colors } from "@/theme/colors";

/** Shared bottom-tab look: white bar, terracotta active tab, line icons (like the old mobile navbar). */
export const tabScreenOptions = {
  headerShown: false,
  tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line, height: 72, paddingTop: 8, paddingBottom: 10 },
  tabBarActiveTintColor: colors.brand,
  tabBarInactiveTintColor: colors.mutedSoft,
  tabBarLabelStyle: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  sceneStyle: { backgroundColor: colors.canvas },
};

export const tabIcon = (Icon: LucideIcon) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon color={String(color)} size={size} strokeWidth={1.9} />;
  };
