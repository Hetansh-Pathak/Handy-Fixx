import type { ReactNode } from "react";
import { useState, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
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

export function TextField({
  label, error, hint, ...input
}: { label: string; error?: string; hint?: string } & Omit<ComponentProps<typeof TextInput>, "className" | "style">) {
  const [focused, setFocused] = useState(false);
  const border = error ? "border-danger" : focused ? "border-gold" : "border-line";
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-white">{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor="#6B6B73"
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
        className={`min-h-[52px] rounded-xl border bg-surface px-4 text-base text-white ${border}`}
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
    <View className="rounded-xl border border-gold/40 bg-gold/10 p-3">
      <Text className="text-sm text-gold">{message}</Text>
    </View>
  ) : null;

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} className="items-center py-2">
      <Text className="text-base font-medium text-gold">{label}</Text>
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
