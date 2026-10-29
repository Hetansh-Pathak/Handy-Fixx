import {
  countByStage, defaultJobStage, formatBookingWhen, formatInr, JOB_STAGES, jobStage, lockedEarningLine, partitionByAccess, providerStatusLabel, requestAccess,
  type BookingStatus, type JobStage,
} from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/text";
import { Body, ErrorBanner, Screen, Title, ListSkeleton } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { useThemeColors } from "@/theme/theme";
import { fetchProviderBookings, serviceNameOf, type ProviderBooking } from "@/features/provider/api";
import { useProviderRuntime } from "@/features/provider/provider-runtime";

const isStage = (v: unknown): v is JobStage => JOB_STAGES.some((s) => s.key === v);

/** Jobs by stage: New → Accepted → On the way → Started → Completed (and Cancelled). */
export default function ProviderJobs() {
  const router = useRouter();
  const { provider } = useSession();
  const rt = useProviderRuntime();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ tab?: string }>();
  const jobs = useQuery({
    queryKey: ["provider-bookings", provider?.id],
    enabled: !!provider?.id,
    refetchInterval: 15_000,
    queryFn: () => fetchProviderBookings(provider!.id),
  });
  const now = new Date();
  const all = jobs.data ?? [];
  const counts = countByStage(all, now);
  const [tab, setTab] = useState<JobStage | null>(isStage(params.tab) ? params.tab : null);

  // A link (the request popup) can ask for a tab; otherwise open where the work is.
  useEffect(() => { if (isStage(params.tab)) setTab(params.tab); }, [params.tab]);
  const current: JobStage = tab ?? (jobs.isSuccess ? defaultJobStage(counts) : "new");
  const rows: ProviderBooking[] = all.filter((b) => jobStage(b, now) === current);
  const stage = JOB_STAGES.find((s) => s.key === current)!;

  // New requests the wallet cannot cover are still shown (so the pro sees what they would earn) but locked:
  // open ones first, at most 3 locked cards, then a counter.
  const accessOf = (b: ProviderBooking) =>
    requestAccess({ price: Number(b.provider_amount ?? 0), wallet: rt.wallet, launchActive: rt.launch.active, walletReady: rt.walletReady });
  const split = current === "new" ? partitionByAccess(rows, (b) => accessOf(b).state === "locked") : null;
  const shown = split ? [...split.open, ...split.locked] : rows;

  return (
    <Screen>
      <Title>Jobs</Title>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">
        {JOB_STAGES.map((s) => {
          const selected = s.key === current;
          const n = counts[s.key];
          return (
            <Pressable key={s.key} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${s.label}, ${n}`}
              onPress={() => setTab(s.key)}
              className={`min-h-[44px] flex-row items-center gap-2 rounded-full border px-4 ${selected ? "border-brand bg-brand" : "border-line bg-card"}`}>
              <Text className={`text-sm font-semibold ${selected ? "text-onbrand" : "text-fg"}`}>{s.label}</Text>
              <View className={`min-w-[22px] items-center rounded-full px-1.5 ${selected ? "bg-onbrand/20" : s.key === "new" && n ? "bg-brand" : "bg-field"}`}>
                <Text className={`text-xs font-bold ${selected || (s.key === "new" && n) ? "text-onbrand" : "text-muted"}`}>{n}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <ErrorBanner message={jobs.isError ? "Could not load your jobs." : null} />
      {jobs.isPending ? <ListSkeleton /> : null}
      {jobs.isSuccess && rows.length === 0 ? <Body muted>{stage.empty}</Body> : null}

      {shown.map((b) => {
        const lock = split ? accessOf(b) : null;
        const isLocked = lock?.state === "locked";
        const missed = b.status === "pending" && current === "cancelled";
        return (
          <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`Job ${serviceNameOf(b)}`}
            onPress={() => router.push({ pathname: "/provider/job/[id]", params: { id: b.id } })}
            className={`gap-1 rounded-tile border bg-card p-4 active:opacity-80 ${current === "new" && !isLocked ? "border-brand" : "border-line"}`}>
            {lock && lock.state === "locked" ? (
              <View className="flex-row items-center gap-1.5">
                <Lock size={14} color={colors.muted} />
                <Text className="text-xs font-semibold uppercase tracking-widest text-muted">Locked</Text>
              </View>
            ) : null}
            <View className="flex-row justify-between gap-3">
              <Text className="flex-1 text-lg font-semibold text-fg">{serviceNameOf(b)}</Text>
              <Text className="text-lg font-bold text-brand">{formatInr(b.provider_amount ?? 0)}</Text>
            </View>
            <Text className="text-sm text-muted">{formatBookingWhen(b.booking_date, b.booking_time)} · {b.city ?? ""}</Text>
            {lock && lock.state === "locked" ? <Text className="text-sm text-fg">{lockedEarningLine(Number(b.provider_amount ?? 0))}</Text> : null}
            {b.special_instructions ? <Text className="text-sm text-fg" numberOfLines={2}>“{b.special_instructions}”</Text> : null}
            <Text className="text-sm font-semibold text-brand">
              {lock && lock.state === "locked" ? lock.cta : current === "new" ? "Tap to review and accept" : missed ? "Missed: the booked time passed" : providerStatusLabel(b.status as BookingStatus)}
            </Text>
          </Pressable>
        );
      })}

      {split && split.hiddenLocked > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${split.hiddenLocked} more locked requests. Recharge your wallet`}
          onPress={() => router.push("/provider/wallet")} className="min-h-[44px] items-center justify-center rounded-tile border border-line bg-card p-3 active:opacity-80">
          <Text className="text-sm font-semibold text-fg">+{split.hiddenLocked} more locked {split.hiddenLocked === 1 ? "request" : "requests"}</Text>
          <Text className="text-xs text-muted">Recharge your wallet to see and accept them</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
