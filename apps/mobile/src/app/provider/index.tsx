import { Text } from "react-native";
import { Body, Card, Screen, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";

/** What the pro should do next, from the account's status and KYC state. */
function nextStep(status: string, kyc: string): { title: string; note: string; tone: "gold" | "ok" | "danger" } {
  if (kyc === "approved" && status === "active") {
    return { title: "You're approved", note: "The online switch and job requests arrive in a later slice.", tone: "ok" };
  }
  if (kyc === "pending") return { title: "Under review", note: "We are checking your documents. This usually takes a short while.", tone: "gold" };
  if (kyc === "rejected") return { title: "Verification needs changes", note: "Your documents were not accepted. The identity wizard arrives in slice 5.", tone: "danger" };
  return { title: "Verify your identity to start", note: "Complete the 9-step identity check to receive jobs. The wizard arrives in slice 5.", tone: "gold" };
}

const TONE = { gold: "text-gold", ok: "text-ok", danger: "text-danger" } as const;

export default function ProviderHome() {
  const { provider, fullName } = useSession();
  const step = nextStep(provider?.status ?? "", provider?.kyc_status ?? "");
  return (
    <Screen>
      <Title>Hi{fullName ? `, ${fullName.split(" ")[0]}` : ""}</Title>
      <Card>
        <Text className={`text-lg font-semibold ${TONE[step.tone]}`}>{step.title}</Text>
        <Body muted>{step.note}</Body>
      </Card>
    </Screen>
  );
}
