import { earningsSummary, formatInr, launchLine } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, CircleCheck, IndianRupee, Star, TrendingUp, type LucideIcon } from "lucide-react-native";
import { Switch, View } from "react-native";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import { Body, Button, Card, ErrorBanner, InfoBanner, Screen, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { fetchProviderBookings } from "@/features/provider/api";
import { useProviderRuntime } from "@/features/provider/provider-runtime";
import { colors } from "@/theme/colors";
import { IconTile, Logo } from "@/components/brand";

/** What the pro should do next, from the account's status and KYC state. */
function nextStep(status: string, kyc: string): { title: string; note: string; tone: "gold" | "ok" | "danger" } | null {
  if (kyc === "approved" && status === "active") return null;
  if (kyc === "pending") return { title: "Under review", note: "We are checking your documents. This usually takes a short while.", tone: "gold" };
  if (kyc === "rejected") return { title: "Verification needs changes", note: "Your documents were not accepted. The identity wizard arrives in a later update.", tone: "danger" };
  return { title: "Verify your identity to start", note: "Complete the 9-step identity check to receive jobs. The wizard arrives in a later update.", tone: "gold" };
}

const TONE = { gold: "text-brand", ok: "text-ok", danger: "text-danger" } as const;

export default function ProviderHome() {
  const router = useRouter();
  const { provider, fullName } = useSession();
  const rt = useProviderRuntime();
  const step = nextStep(provider?.status ?? "", provider?.kyc_status ?? "");
  const bookings = useQuery({
    queryKey: ["provider-bookings", provider?.id],
    enabled: !!provider?.id,
    queryFn: () => fetchProviderBookings(provider!.id),
  });
  const today = earningsSummary(bookings.data ?? [], new Date()).todayTotal;
  const num = (v: number | string | null | undefined, fallback: number) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));
  const stats: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: IndianRupee, label: "Today's earnings", value: formatInr(today) },
    { icon: Star, label: "Rating", value: `${num(provider?.rating, 0).toFixed(1)} ★` },
    { icon: Briefcase, label: "Total jobs", value: String(num(provider?.total_jobs, 0)) },
    { icon: TrendingUp, label: "Acceptance", value: `${num(provider?.acceptance_rate, 100).toFixed(0)}%` },
  ];

  return (
    <Screen>
      <View className="flex-row items-center justify-between"><Logo size={36} /><Text className="text-sm font-semibold text-brand">PRO</Text></View>
      <View className="flex-row items-center gap-2">
        <Title>Hi{fullName ? `, ${fullName.split(" ")[0]}` : ""}</Title>
        {provider?.kyc_status === "approved" ? <CircleCheck size={22} color={colors.ok} accessibilityLabel="Verified pro" /> : null}
      </View>

      {step ? (
        <Card>
          <Text className={`text-lg font-semibold ${TONE[step.tone]}`}>{step.title}</Text>
          <Body muted>{step.note}</Body>
        </Card>
      ) : null}

      <View className={`gap-3 rounded-2xl border p-5 ${rt.online ? "border-brand bg-brand/10" : "border-line bg-card"}`}>
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1 gap-1">
            <Text className={`text-xl font-bold ${rt.online ? "text-brand" : "text-fg"}`}>{rt.online ? "You're online" : "You're offline"}</Text>
            <Text className="text-sm text-muted">
              {rt.online ? "New requests arrive as a notification. Open one to see the details, photos and voice note, then accept or decline." : "Go online to receive job requests. It costs ₹0."}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Go online"
            value={rt.online}
            disabled={!rt.canGoOnline || rt.toggling}
            onValueChange={() => void rt.toggleOnline()}
            trackColor={{ false: "#D9D2C4", true: "#C16430" }}
            thumbColor="#FFFFFF"
          />
        </View>
        {!rt.canGoOnline && rt.switchBlockedReason ? <Text className="text-sm text-muted">{rt.switchBlockedReason}</Text> : null}
      </View>
      <ErrorBanner message={rt.error} />
      <InfoBanner message={rt.notice} />

      <View className="flex-row flex-wrap justify-between gap-y-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <View key={label} className="w-[48%] gap-2 rounded-3xl border border-line bg-card p-4">
            <IconTile size={40}><Icon size={20} color={colors.brand} /></IconTile>
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</Text>
            <Text className="text-2xl font-extrabold text-fg">{value}</Text>
          </View>
        ))}
      </View>

      <Card>
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-sm text-muted">Wallet</Text>
            <Text className="text-3xl font-bold text-fg">{formatInr(rt.wallet.balance)}</Text>
          </View>
          {rt.wallet.due > 0 ? (
            <View className="items-end">
              <Text className="text-sm text-muted">Due</Text>
              <Text className="text-xl font-bold text-danger">{formatInr(rt.wallet.due)}</Text>
            </View>
          ) : null}
        </View>
        {rt.launch.active ? <Text className="text-sm text-ok">{launchLine(rt.launch)}. The ₹15–50 fee is waived.</Text> : <Text className="text-sm text-muted">A flat ₹15 / ₹30 / ₹50 fee is taken from your wallet only when a job completes.</Text>}
        <Button label="Open wallet" variant="secondary" onPress={() => router.push("/provider/wallet")} />
      </Card>
    </Screen>
  );
}
