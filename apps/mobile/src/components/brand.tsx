import {
  Bug, Hammer, MapPin, PaintBucket, Settings, Sparkles, Thermometer, Truck, Users, Wind, Wrench, Zap, Scissors, type LucideIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppLogo } from "@/components/app-logo";
import { Glass } from "@/components/glass";
import { ScreenBackground } from "@/components/screen-background";
import { Text } from "@/components/text";
import { env } from "@/lib/env";
import { useThemeColors } from "@/theme/theme";

/**
 * The apnabanda logo for this build: the Pro app shows the dark PRO pill, the customer app (and the dev build with
 * both roles) the plain logo. Pass `pro` to force one.
 */
export function Logo({ size = 40, pro }: { size?: number; pro?: boolean }) {
  return <AppLogo size={size} pro={pro ?? env.appVariant === "provider"} />;
}

/** `services.icon_name` holds a lucide icon name (the old sites used the same names). */
const ICONS: Record<string, LucideIcon> = { Wrench, Zap, Sparkles, PaintBucket, Wind, Hammer, Bug, Settings, Scissors, Thermometer, MapPin, Truck, Users };

export function ServiceIcon({ name, size = 28, color }: { name: string | null | undefined; size?: number; color?: string }) {
  const colors = useThemeColors();
  const Icon = (name && ICONS[name]) || Wrench;
  return <Icon size={size} color={color ?? colors.brand} strokeWidth={1.8} />;
}

/** The rounded tint square that holds an icon on cards. */
export function IconTile({ children, size = 56 }: { children: ReactNode; size?: number }) {
  return (
    <View className="items-center justify-center rounded-tile bg-tint" style={{ width: size, height: size }}>
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

/** Auth screens: the logo above one frosted card, centered on the glowing canvas. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <ScreenBackground>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20, gap: 20 }}>
          <View className="items-center"><Logo size={44} /></View>
          <Glass tone="card" intensity={30} className="gap-4 rounded-hero border border-line p-5">
            {children}
          </Glass>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}
