import { earningsSummary, FEE_RULE_LABEL, formatBookingWhen, formatInr, jobsCovered, jobsCoveredLine, kycStatusView, launchLine, requestEconomics } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Briefcase, ChevronRight, CircleCheck, IndianRupee, Star, TrendingUp, type LucideIcon } from "lucide-react-native";
import { Pressable, Switch, View } from "react-native";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import { Body, Button, Card, ErrorBanner, HeroCard, InfoBanner, Screen, StatusPill, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { NotificationBell } from "@/features/notifications/components";
import { fetchProviderBookings, serviceNameOf } from "@/features/provider/api";
import { useProviderRuntime } from "@/features/provider/provider-runtime";
import { useThemeColors } from "@/theme/theme";
import { IconTile, Logo } from "@/components/brand";

const TONE = { brand: "text-brand", ok: "text-ok", danger: "text-danger" } as const;

export default function ProviderHome() {
  const colors = useThemeColors();
  const router = useRouter();
  const { provider, fullName } = useSession();
  const rt = useProviderRuntime();
  const kyc = kycStatusView(provider?.kyc_status, provider?.kyc_rejection_reason, provider?.onboarding_step);
  const showKyc = kyc.action !== "none";
  const bookings = useQuery({
    queryKey: ["provider-bookings", provider?.id],
    enabled: !!provider?.id,
    queryFn: () => fetchProviderBookings(provider!.id),
  });
  const today = earningsSummary(bookings.data ?? [], new Date()).todayTotal;
  const next = rt.openRequests[0] ?? null;
  const nextEconomics = next ? requestEconomics({ price: Number(next.provider_amount ?? 0), launchActive: rt.launch.active }) : null;
  const num = (v: number | string | null | undefined, fallback: number) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));
  const stats: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: IndianRupee, label: "Today's earnings", value: formatInr(today) },
    { icon: Star, label: "Rating", value: `${num(provider?.rating, 0).toFixed(1)} ★` },
    { icon: Briefcase, label: "Total jobs", value: String(num(provider?.total_jobs, 0)) },
    { icon: TrendingUp, label: "Acceptance", value: `${num(provider?.acceptance_rate, 100).toFixed(0)}%` },
  ];

  return (
    <Screen>
      <View className="flex-row items-center justify-between"><Logo size={30} pro /><NotificationBell role="provider" /></View>
      <View className="flex-row items-center gap-2">
        <Title>Hi{fullName ? `, ${fullName.split(" ")[0]}` : ""}</Title>
        {provider?.kyc_status === "approved" ? <CircleCheck size={22} color={colors.ok} accessibilityLabel="Verified pro" /> : null}
      </View>

      {showKyc ? (
        <Card>
          <Text className={`text-lg font-semibold ${TONE[kyc.tone]}`}>{kyc.title}</Text>
          <Body muted>{kyc.note}</Body>
          {kyc.button ? <Button label={kyc.button} onPress={() => router.push("/provider/kyc")} /> : (
            <Button label="View status" variant="secondary" onPress={() => router.push("/provider/kyc")} />
          )}
        </Card>
      ) : null}

      <HeroCard className={rt.online ? "border-brand" : ""}>
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1 gap-1">
            <StatusPill label={rt.online ? "Online" : "Offline"} tone={rt.online ? "ok" : "neutral"} />
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
            trackColor={{ false: colors.switchOff, true: colors.brand }}
            thumbColor={colors.white}
          />
        </View>
        {!rt.canGoOnline && rt.switchBlockedReason ? <Text className="text-sm text-muted">{rt.switchBlockedReason}</Text> : null}
      </HeroCard>
      <ErrorBanner message={rt.error} />
      <InfoBanner message={rt.notice} />

      {next ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Review request: ${serviceNameOf(next)}`}
          onPress={() => { rt.markRequestSeen(next.id); router.push({ pathname: "/provider/job/[id]", params: { id: next.id } }); }}
          className="flex-row items-center gap-3 rounded-panel border-2 border-brand bg-card p-4 active:opacity-80">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-brand"><BellRing size={20} color={colors.onBrand} /></View>
          <View className="flex-1">
            <Text className="text-xs font-bold uppercase tracking-wider text-brand">New request{rt.openRequests.length > 1 ? ` · ${rt.openRequests.length} waiting` : ""}</Text>
            <Text className="text-base font-bold text-fg" numberOfLines={1}>{serviceNameOf(next)}</Text>
            <Text className="text-sm text-muted" numberOfLines={1}>{formatBookingWhen(next.booking_date, next.booking_time)}</Text>
          </View>
          <View className="items-end">
            <Text className="text-lg font-extrabold text-price">{formatInr(nextEconomics?.earning ?? 0)}</Text>
            <ChevronRight size={18} color={colors.muted} />
          </View>
        </Pressable>
      ) : null}

      <View className="flex-row flex-wrap justify-between gap-y-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <View key={label} className="w-[48%] gap-2 rounded-panel border border-line bg-card p-4">
            <IconTile size={40}><Icon size={20} color={colors.brand} /></IconTile>
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</Text>
            <Text className="text-2xl font-extrabold text-fg">{value}</Text>
          </View>
        ))}
      </View>

      <View className="gap-2 rounded-hero bg-strip p-5">
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-sm text-strip-fg opacity-80">Wallet</Text>
            <Text className="text-3xl font-extrabold text-strip-fg">{formatInr(rt.wallet.balance)}</Text>
          </View>
          {rt.wallet.due > 0 ? (
            <View className="items-end">
              <Text className="text-sm text-strip-fg opacity-80">Due</Text>
              <Text className="text-xl font-bold text-danger">{formatInr(rt.wallet.due)}</Text>
            </View>
          ) : null}
        </View>
        {rt.launch.active ? <Text className="text-sm font-semibold text-accent">{launchLine(rt.launch)}. No fee is taken.</Text> : <Text className="text-sm text-strip-fg opacity-80">{jobsCoveredLine(jobsCovered(rt.wallet.balance))}. Fee: {FEE_RULE_LABEL}, only when a job completes.</Text>}
        <Button label="Open wallet" variant="secondary" onPress={() => router.push("/provider/wallet")} />
      </View>
    </Screen>
  );
}
