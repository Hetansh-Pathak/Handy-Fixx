import { emailOtpSchema } from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text } from "react-native";
import { Body, Button, Card, ErrorBanner, InfoBanner, TextField } from "@/components/ui";
import { loadEmailVerified, sendEmailCode, verifyEmailCode } from "./api";

/**
 * Customers must verify their email once before their first booking (the booking RLS rule
 * checks the same server-side function). Google accounts count as verified.
 */
export function EmailVerificationCard({ userId, email }: { userId: string; email: string | null }) {
  const queryClient = useQueryClient();
  const { data: verified, isPending } = useQuery({ queryKey: ["email-verified", userId], queryFn: loadEmailVerified });
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isPending) return null;
  if (verified) {
    return (
      <Card>
        <Text className="text-base font-semibold text-ok">Email verified</Text>
        <Body muted>{email}</Body>
      </Card>
    );
  }

  const send = async () => {
    setBusy("send");
    setError(null);
    try {
      await sendEmailCode();
      setCodeSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code.");
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    const parsed = emailOtpSchema.safeParse(code);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Enter the 6-digit code"); return; }
    setBusy("verify");
    setError(null);
    try {
      await verifyEmailCode(parsed.data);
      await queryClient.invalidateQueries({ queryKey: ["email-verified", userId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Text className="text-base font-semibold text-white">Verify your email</Text>
      <Body muted>You need to verify {email ?? "your email"} once before your first booking.</Body>
      <ErrorBanner message={error} />
      <InfoBanner message={codeSent ? "We sent a 6-digit code. It expires in 10 minutes." : null} />
      {codeSent ? (
        <>
          <TextField label="6-digit code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, "")); setError(null); }}
            keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />
          <Button label="Verify" loading={busy === "verify"} onPress={() => void verify()} />
        </>
      ) : null}
      <Button label={codeSent ? "Send a new code" : "Send code"} variant={codeSent ? "secondary" : "primary"} loading={busy === "send"} onPress={() => void send()} />
    </Card>
  );
}
