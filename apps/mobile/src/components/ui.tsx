import type { ReactNode } from "react";
import { useState, type ComponentProps } from "react";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, TextInput, View } from "react-native";
import { Text } from "@/components/text";
import { ArrowLeft, type LucideIcon } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Glass } from "@/components/glass";
import { ScreenBackground } from "@/components/screen-background";
import { useThemeColors } from "@/theme/theme";

/** A full screen: the themed canvas with its two soft glows, safe-area padding, scrolling content. */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = <View className="gap-4 p-5">{children}</View>;
  return (
    <ScreenBackground>
      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
      </SafeAreaView>
    </ScreenBackground>
  );
}

export const Title = ({ children }: { children: ReactNode }) => (
  <Text className="text-3xl font-extrabold tracking-tight text-fg">{children}</Text>
);

export const Body = ({ children, muted = false }: { children: ReactNode; muted?: boolean }) => (
  <Text className={`text-base leading-6 ${muted ? "text-muted" : "text-fg"}`}>{children}</Text>
);

/** Ordinary card: translucent card colour + hairline border, no blur (cheap on low-end phones). Radius 20. */
export const Card = ({ children }: { children: ReactNode }) => (
  <View className="gap-2 rounded-panel border border-line bg-card p-4">{children}</View>
);

/** Top hero / status card: frosted glass (real blur only where it is cheap, see Glass). Radius 28. */
export function HeroCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Glass tone="card" intensity={30} className={`gap-2 rounded-hero border border-line p-5 ${className}`}>{children}</Glass>
  );
}

/** One primary action per step: filled brand. Secondary is outlined. Optional leading icon (e.g. a lock). */
export function Button({
  label, onPress, variant = "primary", loading = false, disabled = false, icon: Icon,
}: {
  label: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; loading?: boolean; disabled?: boolean; icon?: LucideIcon;
}) {
  const colors = useThemeColors();
  const styles = {
    primary: "bg-brand",
    secondary: "border border-line bg-card",
    danger: "bg-danger",
  }[variant];
  const filled = variant !== "secondary";
  const text = filled ? "text-onbrand" : "text-fg";
  const ink = filled ? colors.onBrand : colors.fg;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center justify-center gap-2 rounded-tile px-5 ${styles} ${disabled ? "opacity-40" : "active:opacity-80"}`}
    >
      {loading ? <ActivityIndicator color={ink} /> : (
        <>
          {Icon ? <Icon size={18} color={ink} strokeWidth={2.2} /> : null}
          <Text className={`text-base font-bold ${text}`}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextField({
  label, error, hint, ...input
}: { label: string; error?: string; hint?: string } & Omit<ComponentProps<typeof TextInput>, "className" | "style">) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const border = error ? "border-danger" : focused ? "border-brand" : "border-line";
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-fg">{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedSoft}
        selectionColor={colors.brand}
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
        style={{ fontFamily: "PlusJakartaSans_400Regular" }}
        className={`min-h-[52px] rounded-tile border bg-field px-4 text-base text-fg ${border}`}
      />
      {error ? <Text className="text-sm text-danger">{error}</Text> : hint ? <Text className="text-sm text-muted">{hint}</Text> : null}
    </View>
  );
}

export const ErrorBanner = ({ message }: { message: string | null }) =>
  message ? (
    <View accessibilityRole="alert" className="rounded-tile border border-danger/40 bg-danger-bg p-3">
      <Text className="text-sm text-danger">{message}</Text>
    </View>
  ) : null;

export const InfoBanner = ({ message }: { message: string | null }) =>
  message ? (
    <View className="rounded-tile border border-brand/30 bg-tint p-3">
      <Text className="text-sm text-tint-fg">{message}</Text>
    </View>
  ) : null;

/** Amber notice ("Price is locked", "waiting for the customer"). */
export const WarnBanner = ({ message, icon: Icon }: { message: string | null; icon?: LucideIcon }) => {
  const colors = useThemeColors();
  return message ? (
    <View className="flex-row items-center gap-2 rounded-tile border border-warn/30 bg-warn-bg p-3">
      {Icon ? <Icon size={18} color={colors.warn} /> : null}
      <Text className="flex-1 text-sm font-semibold text-warn">{message}</Text>
    </View>
  ) : null;
};

export type PillTone = "ok" | "warn" | "danger" | "brand" | "neutral";

/** Small status label: Confirmed (ok), Waiting (warn), Problem (danger), Platform fee ₹0 (brand). */
export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: PillTone }) {
  const style = {
    ok: "bg-ok-bg text-ok",
    warn: "bg-warn-bg text-warn",
    danger: "bg-danger-bg text-danger",
    brand: "bg-tint text-tint-fg",
    neutral: "bg-field text-muted",
  }[tone].split(" ");
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${style[0]}`}>
      <Text className={`text-xs font-bold ${style[1]}`}>{label}</Text>
    </View>
  );
}

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} className="min-h-[44px] items-center justify-center py-2">
      <Text className="text-base font-semibold text-brand">{label}</Text>
    </Pressable>
  );
}

export function FullScreenMessage({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <Screen scroll={false}>
      <View className="mt-24 gap-3">
        <Title>{title}</Title>
        <Body muted>{message}</Body>
        {children}
      </View>
    </Screen>
  );
}

export function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} hitSlop={12}
        className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-line bg-card active:opacity-70">
        <ArrowLeft size={22} color={colors.fg} />
      </Pressable>
      <Text className="flex-1 text-xl font-bold tracking-tight text-fg" numberOfLines={1}>{title}</Text>
    </View>
  );
}

/** Small selectable pill (sort options, dates, time slots). Unselected = soft tint, selected = filled brand. */
export function Chip({ label, selected = false, disabled = false, onPress }: { label: string; selected?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[44px] justify-center rounded-full border px-4 ${selected ? "border-brand bg-brand" : "border-transparent bg-tint"} ${disabled ? "opacity-30" : "active:opacity-80"}`}
    >
      <Text className={`text-sm font-semibold ${selected ? "text-onbrand" : "text-tint-fg"}`}>{label}</Text>
    </Pressable>
  );
}

/** A grey placeholder block that gently pulses while real content loads (better than a blank screen or "Loading…"). */
export function Skeleton({ height = 16, width = "100%", radius = 12 }: { height?: number; width?: number | `${number}%`; radius?: number }) {
  const colors = useThemeColors();
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no" style={{ height, width, borderRadius: radius, opacity: pulse, backgroundColor: colors.skeleton }} />;
}

/** A few card-shaped placeholders for a list that is loading. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" className="gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className="gap-2 rounded-panel border border-line bg-card p-4">
          <Skeleton height={18} width="60%" />
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="40%" />
        </View>
      ))}
    </View>
  );
}
