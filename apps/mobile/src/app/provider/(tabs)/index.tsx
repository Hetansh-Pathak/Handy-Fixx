import { formatInr } from "@handyfix/shared";
import { launchLine } from "@handyfix/shared";
import { Switch, Text, View } from "react-native";
import { Body, Card, ErrorBanner, InfoBanner, Screen, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { useProviderRuntime } from "@/features/provider/provider-runtime";

/** What the pro should do next, from the account's status and KYC state. */
function nextStep(status: string, kyc: string): { title: string; note: string; tone: "gold" | "ok" | "danger" } | null {
  if (kyc === "approved" && status === "active") return null;
  if (kyc === "pending") return { title: "Under review", note: "We are checking your documents. This usually takes a short while.", tone: "gold" };
  if (kyc === "rejected") return { title: "Verification needs changes", note: "Your documents were not accepted. The identity wizard arrives in a later update.", tone: "danger" };
  return { title: "Verify your identity to start", note: "Complete the 9-step identity check to receive jobs. The wizard arrives in a later update.", tone: "gold" };
}

const TONE = { gold: "text-gold", ok: "text-ok", danger: "text-danger" } as const;

export default function ProviderHome() {
  const { provider, fullName } = useSession();
  const rt = useProviderRuntime();
  const step = nextStep(provider?.status ?? "", provider?.kyc_status ?? "");

  return (
    <Screen>
      <Title>Hi{fullName ? `, ${fullName.split(" ")[0]}` : ""}</Title>

      {step ? (
        <Card>
          <Text className={`text-lg font-semibold ${TONE[step.tone]}`}>{step.title}</Text>
          <Body muted>{step.note}</Body>
        </Card>
      ) : null}

      <View className={`gap-3 rounded-2xl border p-5 ${rt.online ? "border-gold bg-gold/10" : "border-line bg-surface"}`}>
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1 gap-1">
            <Text className={`text-xl font-bold ${rt.online ? "text-gold" : "text-white"}`}>{rt.online ? "You're online" : "You're offline"}</Text>
            <Text className="text-sm text-muted">
              {rt.online ? "New requests appear with a sound. Accept within 30 seconds." : "Go online to receive job requests. It costs ₹0."}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Go online"
            value={rt.online}
            disabled={!rt.canGoOnline || rt.toggling}
            onValueChange={() => void rt.toggleOnline()}
            trackColor={{ false: "#26262C", true: "#FBB614" }}
            thumbColor="#FFFFFF"
          />
        </View>
        {!rt.canGoOnline && rt.switchBlockedReason ? <Text className="text-sm text-muted">{rt.switchBlockedReason}</Text> : null}
      </View>
      <ErrorBanner message={rt.error} />
      <InfoBanner message={rt.notice} />

      <Card>
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-sm text-muted">Wallet</Text>
            <Text className="text-3xl font-bold text-white">{formatInr(rt.wallet.balance)}</Text>
          </View>
          {rt.wallet.due > 0 ? (
            <View className="items-end">
              <Text className="text-sm text-muted">Due</Text>
              <Text className="text-xl font-bold text-danger">{formatInr(rt.wallet.due)}</Text>
            </View>
          ) : null}
        </View>
        {rt.launch.active ? <Text className="text-sm text-ok">{launchLine(rt.launch)}. The ₹15–50 fee is waived.</Text> : <Text className="text-sm text-muted">A flat ₹15 / ₹30 / ₹50 fee is taken from your wallet only when a job completes.</Text>}
        <Text className="text-xs text-muted">Wallet top-up arrives with the wallet screen.</Text>
      </Card>
    </Screen>
  );
}
