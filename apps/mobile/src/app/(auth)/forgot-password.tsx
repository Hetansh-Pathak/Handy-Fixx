import { forgotPasswordSchema } from "@handyfix/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { sendPasswordReset } from "@/features/auth/api";
import { AuthShell } from "@/components/brand";
import { Body, Button, ErrorBanner, InfoBanner, TextField, TextLink, Title } from "@/components/ui";
import { useZodForm } from "@/lib/use-form";

export default function ForgotPassword() {
  const router = useRouter();
  const form = useZodForm(forgotPasswordSchema, { email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const data = form.validate();
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await sendPasswordReset(data.email);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Title>Reset your password</Title>
      <Body muted>We will email you a link. Open it on this phone to choose a new password.</Body>
      <ErrorBanner message={error} />
      <InfoBanner message={sent ? "If an account exists for that email, a reset link is on its way." : null} />
      <TextField label="Email" value={form.values.email} onChangeText={form.set("email")} error={form.errors.email}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" onSubmitEditing={() => void submit()} />
      <Button label={sent ? "Send again" : "Send reset link"} loading={busy} onPress={() => void submit()} />
      <TextLink label="Back to sign in" onPress={() => router.replace("/sign-in")} />
    </AuthShell>
  );
}
