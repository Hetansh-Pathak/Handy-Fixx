import { closingProblem, closingPrompt } from "@handyfix/shared";
import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card } from "@/components/ui";
import { env } from "@/lib/env";

/**
 * "Problem closing the job?": shown to the customer and the pro once a job has been in progress for 2 hours
 * without the completion code (PDF p.10). It only points to HandyFix support; the admin sees the same jobs in
 * Bookings > Needs help. Renders nothing before 2 hours, so it is safe to mount on every job screen.
 */
export function ClosingProblemCard({ role, bookingId, status, startedAt, otherName }: {
  role: "customer" | "provider"; bookingId: string; status: string; startedAt: string | null | undefined; otherName?: string | null;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (status !== "in_progress") return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [status]);

  if (!closingProblem({ status, startedAt, now }).active) return null;
  const prompt = closingPrompt(role, otherName);
  const subject = encodeURIComponent(`Problem closing job ${bookingId.slice(0, 8)}`);
  return (
    <Card>
      <Text accessibilityRole="header" className="text-lg font-semibold text-fg">{prompt.title}</Text>
      <Body muted>{prompt.body}</Body>
      <Button label="Email apnabanda" variant="secondary" onPress={() => void Linking.openURL(`mailto:${env.supportEmail}?subject=${subject}`)} />
      {env.supportPhone ? <Button label={`Call apnabanda ${env.supportPhone}`} variant="secondary" onPress={() => void Linking.openURL(`tel:${env.supportPhone}`)} /> : null}
    </Card>
  );
}
