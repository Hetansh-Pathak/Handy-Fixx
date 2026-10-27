import { isRecoveryLink, parseAuthLink, resetPasswordSchema } from "@handyfix/shared";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { applyRecoveryLink, updatePassword } from "@/features/auth/api";
import { useSession } from "@/features/auth/session-provider";
import { AuthShell } from "@/components/brand";
import { Body, Button, ErrorBanner, InfoBanner, TextField, TextLink, Title } from "@/components/ui";
import { useZodForm } from "@/lib/use-form";

type Phase = "waiting" | "ready" | "invalid" | "done";

/** Opened by the emailed link (handyfix://reset-password#access_token=…&type=recovery). */
export default function ResetPassword() {
  const router = useRouter();
  const { setRecovering } = useSession();
  const url = Linking.useLinkingURL();
  const form = useZodForm(resetPasswordSchema, { password: "", confirmPassword: "" });
  const [phase, setPhase] = useState<Phase>("waiting");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!url) return;
    // A new link replaces whatever the previous one left on screen (e.g. an "expired" notice).
    setError(null);
    setPhase("waiting");
    const params = parseAuthLink(url);
    if (!isRecoveryLink(params)) {
      setError(params.error ? "This link has expired. Request a new one." : "This link is not valid. Request a new one.");
      setPhase("invalid");
      return;
    }
    let cancelled = false;
    // Keep the route guards from treating the temporary recovery session as a normal sign-in.
    setRecovering(true);
    applyRecoveryLink(url)
      .then(() => !cancelled && setPhase("ready"))
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "This link is not valid.");
        setPhase("invalid");
        setRecovering(false);
      });
    return () => { cancelled = true; };
  }, [url, setRecovering]);

  // Leaving the screen (back button, done, or an abandoned reset) returns to normal routing.
  useEffect(() => () => setRecovering(false), [setRecovering]);

  const submit = async () => {
    const data = form.validate();
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await updatePassword(data.password);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Title>Choose a new password</Title>
      <ErrorBanner message={error} />
      {phase === "waiting" ? <Body muted>Checking your link…</Body> : null}
      {phase === "invalid" ? <Button label="Request a new link" onPress={() => router.replace("/forgot-password")} /> : null}
      {phase === "ready" ? (
        <>
          <TextField label="New password" value={form.values.password} onChangeText={form.set("password")} error={form.errors.password}
            hint="8+ characters with a letter and a number" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
          <TextField label="Confirm new password" value={form.values.confirmPassword} onChangeText={form.set("confirmPassword")} error={form.errors.confirmPassword}
            secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" onSubmitEditing={() => void submit()} />
          <Button label="Update password" loading={busy} onPress={() => void submit()} />
        </>
      ) : null}
      {phase === "done" ? (
        <>
          <InfoBanner message="Password updated. You are signed in." />
          <Button label="Continue" onPress={() => { setRecovering(false); router.replace("/"); }} />
        </>
      ) : null}
      {phase !== "done" ? <TextLink label="Back to sign in" onPress={() => router.replace("/sign-in")} /> : null}
    </AuthShell>
  );
}
