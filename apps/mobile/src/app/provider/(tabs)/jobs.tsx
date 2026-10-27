import { formatBookingWhen, formatInr, providerStatusLabel, type BookingStatus } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { Body, Chip, ErrorBanner, Screen, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { fetchProviderBookings, serviceNameOf, type ProviderBooking } from "@/features/provider/api";

type Tab = "requests" | "active" | "done";
const TABS: { key: Tab; label: string; match: (s: string) => boolean }[] = [
  { key: "requests", label: "Requests", match: (s) => s === "pending" },
  { key: "active", label: "Active", match: (s) => ["confirmed", "on_the_way", "arrived", "in_progress"].includes(s) },
  { key: "done", label: "Done", match: (s) => s === "completed" || s === "cancelled" },
];

export default function ProviderJobs() {
  const router = useRouter();
  const { provider } = useSession();
  const [tab, setTab] = useState<Tab>("active");
  const jobs = useQuery({
    queryKey: ["provider-bookings", provider?.id],
    enabled: !!provider?.id,
    refetchInterval: 15_000,
    queryFn: () => fetchProviderBookings(provider!.id),
  });
  const current = TABS.find((t) => t.key === tab)!;
  const rows: ProviderBooking[] = (jobs.data ?? []).filter((b) => current.match(b.status));

  return (
    <Screen>
      <Title>Jobs</Title>
      <View className="flex-row gap-2">
        {TABS.map((t) => (
          <Chip key={t.key} label={`${t.label} ${(jobs.data ?? []).filter((b) => t.match(b.status)).length}`} selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>
      <ErrorBanner message={jobs.isError ? "Could not load your jobs." : null} />
      {jobs.isPending ? <Body muted>Loading…</Body> : null}
      {jobs.isSuccess && rows.length === 0 ? <Body muted>Nothing here yet.</Body> : null}
      {rows.map((b) => (
        <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`Job ${serviceNameOf(b)}`}
          onPress={() => router.push({ pathname: "/provider/job/[id]", params: { id: b.id } })}
          className="gap-1 rounded-2xl border border-line bg-card p-4 active:opacity-80">
          <View className="flex-row justify-between gap-3">
            <Text className="flex-1 text-lg font-semibold text-fg">{serviceNameOf(b)}</Text>
            <Text className="text-lg font-bold text-brand">{formatInr(b.provider_amount ?? 0)}</Text>
          </View>
          <Text className="text-sm text-muted">{formatBookingWhen(b.booking_date, b.booking_time)} · {b.city ?? ""}</Text>
          <Text className="text-sm text-brand">{b.status === "pending" ? "Waiting for you" : providerStatusLabel(b.status as BookingStatus)}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
