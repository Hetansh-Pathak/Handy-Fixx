import {
  countByStage, defaultJobStage, formatBookingWhen, formatInr, JOB_STAGES, jobStage, providerStatusLabel, type BookingStatus, type JobStage,
} from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/text";
import { Body, ErrorBanner, Screen, Title, ListSkeleton } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { fetchProviderBookings, serviceNameOf, type ProviderBooking } from "@/features/provider/api";

const isStage = (v: unknown): v is JobStage => JOB_STAGES.some((s) => s.key === v);

/** Jobs by stage: New → Accepted → On the way → Started → Completed (and Cancelled). */
export default function ProviderJobs() {
  const router = useRouter();
  const { provider } = useSession();
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

      {rows.map((b) => {
        const missed = b.status === "pending" && current === "cancelled";
        return (
          <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`Job ${serviceNameOf(b)}`}
            onPress={() => router.push({ pathname: "/provider/job/[id]", params: { id: b.id } })}
            className={`gap-1 rounded-tile border bg-card p-4 active:opacity-80 ${current === "new" ? "border-brand" : "border-line"}`}>
            <View className="flex-row justify-between gap-3">
              <Text className="flex-1 text-lg font-semibold text-fg">{serviceNameOf(b)}</Text>
              <Text className="text-lg font-bold text-brand">{formatInr(b.provider_amount ?? 0)}</Text>
            </View>
            <Text className="text-sm text-muted">{formatBookingWhen(b.booking_date, b.booking_time)} · {b.city ?? ""}</Text>
            {b.special_instructions ? <Text className="text-sm text-fg" numberOfLines={2}>“{b.special_instructions}”</Text> : null}
            <Text className="text-sm font-semibold text-brand">
              {current === "new" ? "Tap to review and accept" : missed ? "Missed: the booked time passed" : providerStatusLabel(b.status as BookingStatus)}
            </Text>
          </Pressable>
        );
      })}
    </Screen>
  );
}
