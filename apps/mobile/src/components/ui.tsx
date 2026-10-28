import type { ReactNode } from "react";
import { useState, type ComponentProps } from "react";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, TextInput, View } from "react-native";
import { Text } from "@/components/text";
import { ArrowLeft } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = <View className="gap-4 p-5">{children}</View>;
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => (
  <Text className="text-3xl font-bold text-fg">{children}</Text>
);

export const Body = ({ children, muted = false }: { children: ReactNode; muted?: boolean }) => (
  <Text className={`text-base leading-6 ${muted ? "text-muted" : "text-fg"}`}>{children}</Text>
);

export const Card = ({ children }: { children: ReactNode }) => (
  <View className="gap-2 rounded-2xl border border-line bg-card p-4">{children}</View>
);

/** One primary action per step: terracotta. Secondary is outlined. */
export function Button({
  label, onPress, variant = "primary", loading = false, disabled = false,
}: {
  label: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; loading?: boolean; disabled?: boolean;
}) {
  const styles = {
    primary: "bg-brand",
    secondary: "border border-line bg-card",
    danger: "bg-danger",
  }[variant];
  const text = variant === "secondary" ? "text-fg" : "text-white";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center justify-center rounded-xl px-5 ${styles} ${disabled ? "opacity-40" : "active:opacity-80"}`}
    >
      {loading ? <ActivityIndicator color={variant === "secondary" ? "#1C1C1C" : "#fff"} /> : <Text className={`text-base font-semibold ${text}`}>{label}</Text>}
    </Pressable>
  );
}

export function TextField({
  label, error, hint, ...input
}: { label: string; error?: string; hint?: string } & Omit<ComponentProps<typeof TextInput>, "className" | "style">) {
  const [focused, setFocused] = useState(false);
  const border = error ? "border-danger" : focused ? "border-brand" : "border-line";
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-fg">{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor="#6B665D"
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
        style={{ fontFamily: "PlusJakartaSans_400Regular" }}
        className={`min-h-[52px] rounded-xl border bg-field px-4 text-base text-fg ${border}`}
      />
      {error ? <Text className="text-sm text-danger">{error}</Text> : hint ? <Text className="text-sm text-muted">{hint}</Text> : null}
    </View>
  );
}

export const ErrorBanner = ({ message }: { message: string | null }) =>
  message ? (
    <View accessibilityRole="alert" className="rounded-xl border border-danger bg-danger/10 p-3">
      <Text className="text-sm text-danger">{message}</Text>
    </View>
  ) : null;

export const InfoBanner = ({ message }: { message: string | null }) =>
  message ? (
    <View className="rounded-xl border border-brand/40 bg-brand/10 p-3">
      <Text className="text-sm text-brand-dark">{message}</Text>
    </View>
  ) : null;

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} className="items-center py-2">
      <Text className="text-base font-medium text-brand">{label}</Text>
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
  return (
    <View className="flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} hitSlop={12} className="min-h-[44px] min-w-[44px] items-center justify-center">
        <ArrowLeft size={24} color="#1C1C1C" />
      </Pressable>
      <Text className="flex-1 text-xl font-semibold text-fg" numberOfLines={1}>{title}</Text>
    </View>
  );
}

/** Small selectable pill (sort options, dates, time slots). */
export function Chip({ label, selected = false, disabled = false, onPress }: { label: string; selected?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[44px] justify-center rounded-full border px-4 ${selected ? "border-brand bg-brand" : "border-line bg-card"} ${disabled ? "opacity-30" : ""}`}
    >
      <Text className={`text-sm font-semibold ${selected ? "text-white" : "text-fg"}`}>{label}</Text>
    </Pressable>
  );
}

/** A grey placeholder block that gently pulses while real content loads (better than a blank screen or "Loading…"). */
export function Skeleton({ height = 16, width = "100%", radius = 12 }: { height?: number; width?: number | `${number}%`; radius?: number }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no" style={{ height, width, borderRadius: radius, opacity: pulse, backgroundColor: "#E4DDD0" }} />;
}

/** A few card-shaped placeholders for a list that is loading. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" className="gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className="gap-2 rounded-2xl border border-line bg-card p-4">
          <Skeleton height={18} width="60%" />
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="40%" />
        </View>
      ))}
    </View>
  );
}
