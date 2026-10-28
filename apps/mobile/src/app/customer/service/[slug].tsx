import { formatDuration, formatInr, formatRating, sortProviders, type ProviderSort } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { IconTile, ServiceIcon } from "@/components/brand";
import { Avatar } from "@/components/Avatar";
import { CitySuggestions } from "@/components/CitySuggestions";
import { Text } from "@/components/text";
import { Body, Button, Chip, ErrorBanner, Screen, ScreenHeader, TextField, Title } from "@/components/ui";
import { useArea } from "@/features/customer/area-context";
import { fetchServiceBySlug, fetchSubItems, searchProviders } from "@/features/customer/catalog-api";
import type { ProviderListing, SubItemRow } from "@/features/customer/types";

type SortChoice = Extract<ProviderSort, "top_rated" | "cheapest">;

export default function ServiceScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { area, setArea } = useArea();
  const [subId, setSubId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortChoice>("top_rated");

  const service = useQuery({ queryKey: ["service", slug], queryFn: () => fetchServiceBySlug(slug), enabled: !!slug });
  const serviceId = service.data?.id;
  const subItems = useQuery({ queryKey: ["sub-items", serviceId], queryFn: () => fetchSubItems(serviceId!), enabled: !!serviceId });
  const subItem: SubItemRow | null = subItems.data?.find((s) => s.id === subId) ?? null;

  // Pros come and go as they open and close the app, so the list refreshes itself.
  const providers = useQuery({
    queryKey: ["providers", serviceId, subId, area.trim().toLowerCase()],
    enabled: !!service.data && !subItems.isPending,
    refetchInterval: 15_000,
    queryFn: () => searchProviders({ service: service.data!, subItem, area, now: new Date() }),
  });

  const sorted = useMemo(() => sortProviders(providers.data?.listings ?? [], sort), [providers.data, sort]);
  const needsSubItem = (subItems.data?.length ?? 0) > 0 && !subItem;

  const book = (p: ProviderListing) =>
    router.push({ pathname: "/customer/book/[providerId]", params: { providerId: p.id, service: slug, ...(subId ? { sub: subId } : {}) } });

  return (
    <Screen>
      <ScreenHeader title={service.data?.name ?? "Service"} onBack={() => router.back()} />
      {service.isError ? <ErrorBanner message="Could not load this service." /> : null}
      {service.isSuccess && !service.data ? <Body muted>This service is not available.</Body> : null}
      {service.data ? (
        <View className="gap-1">
          <View className="mb-2 flex-row items-center gap-3"><IconTile size={52}><ServiceIcon name={service.data.icon_name} size={26} /></IconTile></View>
          <Title>{service.data.name}</Title>
          {service.data.description ? <Body muted>{service.data.description}</Body> : null}
          <Text className="text-sm text-brand">
            {service.data.base_price ? `Starts from ${formatInr(service.data.base_price)}` : ""}
            {service.data.duration_minutes ? `  ·  ~${formatDuration(service.data.duration_minutes)}` : ""}
          </Text>
        </View>
      ) : null}

      {(subItems.data?.length ?? 0) > 0 ? (
        <View className="gap-2">
          <Text className="text-lg font-semibold text-fg">What do you need?</Text>
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {subItems.data!.map((s) => {
              const selected = s.id === subId;
              return (
                <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setSubId(selected ? null : s.id)}
                  className={`w-[48%] gap-1 rounded-3xl border-2 p-4 ${selected ? "border-brand bg-brand-soft" : "border-line bg-card"}`}>
                  <Text className="text-3xl">{s.icon ?? "🛠️"}</Text>
                  <Text className="mt-1 text-base font-semibold text-fg">{s.name}</Text>
                  {s.description ? <Text className="text-xs leading-4 text-muted" numberOfLines={2}>{s.description}</Text> : null}
                  <Text className="mt-1 text-lg font-bold text-brand">{formatInr(s.base_price)}</Text>
                  {s.duration_minutes ? <Text className="text-xs text-muted">{formatDuration(s.duration_minutes)}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <TextField label="Your area" value={area} onChangeText={setArea} placeholder="City or 6-digit pincode" autoCapitalize="words" />
      <CitySuggestions query={area} onPick={setArea} />

      <View className="flex-row gap-2">
        <Chip label="Top rated" selected={sort === "top_rated"} onPress={() => setSort("top_rated")} />
        <Chip label="Cheapest" selected={sort === "cheapest"} onPress={() => setSort("cheapest")} />
      </View>

      {needsSubItem ? <Body muted>Choose what you need above to see pros and prices.</Body> : null}
      <ErrorBanner message={providers.isError ? "Could not load pros. Check your connection." : null} />
      {!needsSubItem && providers.isPending ? <Body muted>Finding pros near you…</Body> : null}
      {!needsSubItem && providers.isSuccess && sorted.length === 0 ? (
        <View className="gap-3 rounded-3xl border border-line bg-card p-4">
          <Text className="text-base font-semibold text-fg">No pros online{area.trim() ? ` in ${area.trim()}` : ""} right now</Text>
          <Body muted>
            {providers.data.offlineCount
              ? `${providers.data.offlineCount} ${providers.data.offlineCount === 1 ? "pro covers" : "pros cover"} ${area.trim() || "this service"} but ${providers.data.offlineCount === 1 ? "is" : "are"} offline. Pros appear here while they have the HandyFix Pro app open and are online.`
              : area.trim()
                ? `No pro covers ${area.trim()} for this service yet. Try a nearby city or your 6-digit pincode.`
                : "Pros appear here while they have the app open. Try again in a moment."}
          </Body>
          <Button label="Refresh" variant="secondary" onPress={() => void providers.refetch()} />
        </View>
      ) : null}

      {!needsSubItem ? sorted.map((p) => (
        <View key={p.id} className="gap-3 rounded-3xl border border-line bg-card p-4">
          <View className="flex-row items-start justify-between gap-3">
            <Avatar name={p.fullName} url={p.avatarUrl} size={56} />
            <View className="flex-1 gap-0.5">
              <Text className="text-lg font-semibold text-fg">{p.fullName}{p.isVerified ? "  ✓" : ""}</Text>
              <Text className="text-sm text-muted">
                ★ {formatRating(p.rating)}{p.totalReviews ? ` (${p.totalReviews})` : ""}  ·  {p.totalJobs} jobs
                {p.experienceYears ? `  ·  ${p.experienceYears} yr exp` : ""}
              </Text>
            </View>
            <Text className="text-2xl font-bold text-brand">{formatInr(p.price)}</Text>
          </View>
          {p.bio ? <Text className="text-sm text-muted" numberOfLines={2}>{p.bio}</Text> : null}
          <Button label={`Book ${p.fullName.split(" ")[0]}`} onPress={() => book(p)} />
        </View>
      )) : null}
    </Screen>
  );
}
