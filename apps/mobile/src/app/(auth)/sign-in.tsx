import { signInSchema } from "@handyfix/shared";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { signInWithEmail } from "@/features/auth/api";
import { Body, Button, ErrorBanner, Screen, TextField, TextLink, Title } from "@/components/ui";
import { env } from "@/lib/env";
import { signInWithGoogle } from "@/lib/google-auth";
import { useZodForm } from "@/lib/use-form";

export default function SignIn() {
  const router = useRouter();
  const form = useZodForm(signInSchema, { email: "", password: "" });
  const [busy, setBusy] = useState<"password" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const data = form.validate();
    if (!data) return;
    setBusy("password");
    setError(null);
    try {
      await signInWithEmail(data.email, data.password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setBusy("google");
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View className="mt-8 gap-1">
        <Text className="text-sm font-semibold uppercase tracking-widest text-gold">HandyFix</Text>
        <Title>Welcome back</Title>
        <Body muted>Sign in to book trusted pros or manage your jobs.</Body>
      </View>
      <ErrorBanner message={error} />
      <TextField label="Email" value={form.values.email} onChangeText={form.set("email")} error={form.errors.email}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
      <TextField label="Password" value={form.values.password} onChangeText={form.set("password")} error={form.errors.password}
        secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" onSubmitEditing={() => void submit()} />
      <Button label="Sign in" loading={busy === "password"} disabled={busy === "google"} onPress={() => void submit()} />
      <TextLink label="Forgot password?" onPress={() => router.push("/forgot-password")} />
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-line" />
        <Text className="text-sm text-muted">or</Text>
        <View className="h-px flex-1 bg-line" />
      </View>
      <Button label="Continue with Google" variant="secondary" loading={busy === "google"} disabled={busy === "password"} onPress={() => void google()} />
      <TextLink label="New here? Create an account" onPress={() => router.push("/sign-up")} />
      {env.spikeEnabled ? (
        <Link href="/spike" asChild>
          <Text className="py-2 text-center text-sm text-muted">Developer: native checks</Text>
        </Link>
      ) : null}
    </Screen>
  );
}
