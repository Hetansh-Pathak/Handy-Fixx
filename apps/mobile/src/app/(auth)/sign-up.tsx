import { signUpSchema } from "@handyfix/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { signUpWithEmail } from "@/features/auth/api";
import { AuthShell } from "@/components/brand";
import { env } from "@/lib/env";
import { LegalAgreementLinks } from "@/features/legal/legal-screen";
import { Body, Button, ErrorBanner, InfoBanner, TextField, TextLink, Title } from "@/components/ui";
import { useZodForm } from "@/lib/use-form";

export default function SignUp() {
  const router = useRouter();
  const form = useZodForm(signUpSchema, { fullName: "", email: "", password: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    const data = form.validate();
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const { needsConfirmation } = await signUpWithEmail(data);
      // With a session the root layout moves to role-pick by itself.
      if (needsConfirmation) setNotice("Check your inbox and confirm your email, then sign in.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create your account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Title>Create your account</Title>
      <Body muted>{env.appVariant === "provider" ? "Join HandyFix Pro and start receiving jobs." : env.appVariant === "customer" ? "Book trusted pros for any home service." : "One account, one role. You choose customer or pro on the next step."}</Body>
      <ErrorBanner message={error} />
      <InfoBanner message={notice} />
      <TextField label="Full name" value={form.values.fullName} onChangeText={form.set("fullName")} error={form.errors.fullName}
        autoCapitalize="words" autoComplete="name" textContentType="name" />
      <TextField label="Email" value={form.values.email} onChangeText={form.set("email")} error={form.errors.email}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
      <TextField label="Password" value={form.values.password} onChangeText={form.set("password")} error={form.errors.password}
        hint="8+ characters with a letter and a number" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
      <TextField label="Confirm password" value={form.values.confirmPassword} onChangeText={form.set("confirmPassword")} error={form.errors.confirmPassword}
        secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" onSubmitEditing={() => void submit()} />
      <Button label="Create account" loading={busy} onPress={() => void submit()} />
      <LegalAgreementLinks />
      <TextLink label="Already have an account? Sign in" onPress={() => router.replace("/sign-in")} />
    </AuthShell>
  );
}
