import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = <View className="gap-4 p-5">{children}</View>;
  return (
    <SafeAreaView className="flex-1 bg-ink" edges={["top", "bottom"]}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => (
  <Text className="text-3xl font-bold text-white">{children}</Text>
);

export const Body = ({ children, muted = false }: { children: ReactNode; muted?: boolean }) => (
  <Text className={`text-base leading-6 ${muted ? "text-muted" : "text-white"}`}>{children}</Text>
);

export const Card = ({ children }: { children: ReactNode }) => (
  <View className="gap-2 rounded-2xl border border-line bg-surface p-4">{children}</View>
);

/** One primary action per step: gold. Secondary is outlined. */
export function Button({
  label, onPress, variant = "primary", loading = false, disabled = false,
}: {
  label: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; loading?: boolean; disabled?: boolean;
}) {
  const styles = {
    primary: "bg-gold",
    secondary: "border border-line bg-surface",
    danger: "bg-danger",
  }[variant];
  const text = variant === "primary" ? "text-ink" : "text-white";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      className={`min-h-[52px] flex-row items-center justify-center rounded-xl px-5 ${styles} ${disabled ? "opacity-40" : "active:opacity-80"}`}
    >
      {loading ? <ActivityIndicator color={variant === "primary" ? "#0A0A0A" : "#fff"} /> : <Text className={`text-base font-semibold ${text}`}>{label}</Text>}
    </Pressable>
  );
}
