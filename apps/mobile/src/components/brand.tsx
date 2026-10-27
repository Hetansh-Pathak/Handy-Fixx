import {
  Bug, Hammer, MapPin, PaintBucket, Settings, Sparkles, Thermometer, Wind, Wrench, Zap, Scissors, type LucideIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Image, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/text";
import { colors } from "@/theme/colors";

/** The HandyFix logo tile and wordmark, as in the old sites' navbar. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <View className="flex-row items-center gap-3">
      <Image source={require("../../assets/images/logo.jpg")} style={{ width: size, height: size, borderRadius: size * 0.28 }} accessibilityLabel="HandyFix logo" />
      <Text className="text-2xl font-bold text-fg">HandyFix</Text>
    </View>
  );
}

/** `services.icon_name` holds a lucide icon name (the old sites used the same names). */
const ICONS: Record<string, LucideIcon> = { Wrench, Zap, Sparkles, PaintBucket, Wind, Hammer, Bug, Settings, Scissors, Thermometer, MapPin };

export function ServiceIcon({ name, size = 28, color = colors.brand }: { name: string | null | undefined; size?: number; color?: string }) {
  const Icon = (name && ICONS[name]) || Wrench;
  return <Icon size={size} color={color} strokeWidth={1.8} />;
}

/** The rounded brand-soft square that holds an icon on cards. */
export function IconTile({ children, size = 56 }: { children: ReactNode; size?: number }) {
  return (
    <View className="items-center justify-center rounded-2xl bg-brand-soft" style={{ width: size, height: size }}>
      {children}
    </View>
  );
}

/** Centered section heading + sub line, as on the old landing page. */
export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="items-center gap-2 px-2">
      <Text className="text-center text-2xl font-extrabold text-fg">{title}</Text>
      {subtitle ? <Text className="text-center text-base text-muted">{subtitle}</Text> : null}
    </View>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return <Text className="text-sm font-semibold uppercase tracking-wider text-brand">{children}</Text>;
}

/** Auth screens: logo on top of one white card, centered on the cream background (like the old /auth page). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }}>
        <View className="gap-4 rounded-3xl border border-line bg-card p-5" style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}>
          <View className="items-center pb-1"><Logo /></View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
