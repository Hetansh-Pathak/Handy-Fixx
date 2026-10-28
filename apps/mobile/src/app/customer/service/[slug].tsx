import { distanceKm, formatDistance, formatDuration, formatInr, formatRating, groupSubItems, isCheckupVisit, sortProviders, type LatLng, type ProviderSort } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { BadgeCheck, Lock } from "lucide-react-native";
import { Image, Pressable, View } from "react-native";
import { IconTile, ServiceIcon } from "@/components/brand";
import { Avatar } from "@/components/Avatar";
import { CitySuggestions } from "@/components/CitySuggestions";
import { Text } from "@/components/text";
import { Body, Button, Chip, ErrorBanner, Screen, ScreenHeader, StatusPill, TextField, Title, ListSkeleton } from "@/components/ui";
import { useThemeColors } from "@/theme/theme";
import { useArea } from "@/features/customer/area-context";
import { fetchServiceBySlug, fetchSubItems, searchProviders } from "@/features/customer/catalog-api";
import { serviceImage } from "@/features/customer/service-images";
import type { ProviderListing, SubItemRow } from "@/features/customer/types";

type SortChoice = ProviderSort;

export default function ServiceScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { area, setArea } = useArea();
  const [subId, setSubId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortChoice>("top_rated");

  const service = useQuery({ queryKey: ["service", slug], queryFn: () => fetchServiceBySlug(slug), enabled: !!slug });
  const serviceId = service.data?.id;
  const subItems = useQuery({ queryKey: ["sub-items", serviceId], queryFn: () => fetchSubItems(serviceId!), enabled: !!serviceId });
  const subItem: SubItemRow | null = subItems.data?.find((s) => s.id === subId) ?? null;
  const sections = useMemo(() => groupSubItems(subItems.data ?? []), [subItems.data]);
  const [section, setSection] = useState<string | null>(null);
  // The tapped section, else the section of the chosen item, else the first one.
  const currentSection = sections.find((g) => g.section === section) ?? sections.find((g) => g.items.some((i) => i.id === subId)) ?? sections[0];

  // Pros come and go as they open and close the app, so the list refreshes itself.
  const providers = useQuery({
    queryKey: ["providers", serviceId, subId, area.trim().toLowerCase()],
    enabled: !!service.data && !subItems.isPending,
    refetchInterval: 15_000,
    queryFn: () => searchProviders({ service: service.data!, subItem, area, now: new Date() }),
  });

  // "Nearest" needs the customer's position (asked only when they tap it) and pros who share their area.
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const withDistance = useMemo(
    () => (providers.data?.listings ?? []).map((p) => ({ ...p, distanceKm: here && p.point ? distanceKm(here, p.point) : null })),
    [providers.data, here],
  );
  const canSortNearest = (providers.data?.listings ?? []).some((p) => p.point);
  const sorted = useMemo(() => sortProviders(withDistance, sort), [withDistance, sort]);
  const lowestPrice = sorted.length ? Math.min(...sorted.map((p) => p.price)) : null;

  const pickNearest = async () => {
    setSort("nearest");
    if (here) return;
    setLocating(true);
    setLocationNote(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error("Allow location to sort by distance, or type your area above.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch (e) {
      setSort("top_rated");
      setLocationNote(e instanceof Error ? e.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  };
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
          {serviceImage(service.data.slug) ? (
            <Image source={serviceImage(service.data.slug)!} accessibilityIgnoresInvertColors resizeMode="cover"
              style={{ width: "100%", height: 160, borderRadius: 24, marginBottom: 8 }} />
          ) : (
            <View className="mb-2 flex-row items-center gap-3"><IconTile size={52}><ServiceIcon name={service.data.icon_name} size={26} /></IconTile></View>
          )}
          <Title>{service.data.name}</Title>
          {service.data.description ? <Body muted>{service.data.description}</Body> : null}
          <Text className="text-sm text-brand">
            {service.data.base_price ? `Starts at ${formatInr(service.data.base_price)}` : ""}
            {service.data.duration_minutes ? `  ·  ~${formatDuration(service.data.duration_minutes)}` : ""}
          </Text>
        </View>
      ) : null}

      {(subItems.data?.length ?? 0) > 0 ? (
        <View className="gap-3">
          {sections.length > 1 ? (
            <>
              <Text className="text-lg font-semibold text-fg">Select a service</Text>
              <View className="flex-row flex-wrap gap-2">
                {sections.map((g) => {
                  const selected = g.section === currentSection?.section;
                  return (
                    <Pressable key={g.section} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${g.section}, ${g.items.length} options`}
                      onPress={() => setSection(g.section)}
                      className={`w-[31%] items-center gap-1 rounded-tile border-2 px-1 py-3 ${selected ? "border-brand bg-brand-soft" : "border-line bg-card"}`}>
                      <Text className="text-2xl">{g.items[0]?.icon ?? "🛠️"}</Text>
                      <Text className="text-center text-xs font-semibold text-fg" numberOfLines={2}>{g.section}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
          <Text className="text-lg font-semibold text-fg">{sections.length > 1 && currentSection ? currentSection.section : "What do you need?"}</Text>
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {(currentSection?.items ?? []).map((s) => {
              const selected = s.id === subId;
              const visit = isCheckupVisit(s.name);
              return (
                <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setSubId(selected ? null : s.id)}
                  className={`w-[48%] gap-1 rounded-panel border-2 p-4 ${selected ? "border-brand bg-brand-soft" : visit ? "border-dashed border-brand/50 bg-card" : "border-line bg-card"}`}>
                  <View className="flex-row items-start justify-between">
                    <Text className="text-3xl">{s.icon ?? "🛠️"}</Text>
                    {visit ? <Text className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold uppercase text-brand">Visit</Text> : null}
                  </View>
                  <Text className="mt-1 text-base font-semibold text-fg">{s.name}</Text>
                  {s.description ? <Text className="text-xs leading-4 text-muted" numberOfLines={2}>{s.description}</Text> : null}
                  <Text className="mt-1 text-xs text-muted">Starts at</Text>
                  <Text className="text-lg font-bold text-brand">{formatInr(s.base_price)}</Text>
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
        {canSortNearest ? <Chip label={locating ? "Locating…" : "Nearest"} selected={sort === "nearest"} disabled={locating} onPress={() => void pickNearest()} /> : null}
      </View>
      {locationNote ? <Text className="text-sm text-muted">{locationNote}</Text> : null}

      {needsSubItem ? <Body muted>Choose what you need above to see pros and prices.</Body> : null}
      <ErrorBanner message={providers.isError ? "Could not load pros. Check your connection." : null} />
      {!needsSubItem && providers.isPending ? <ListSkeleton rows={2} /> : null}
      {!needsSubItem && providers.isSuccess && sorted.length === 0 ? (
        <View className="gap-3 rounded-panel border border-line bg-card p-4">
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

      {!needsSubItem ? sorted.map((p) => {
        const lowest = sorted.length > 1 && p.price === lowestPrice;
        return (
          <View key={p.id} className={`gap-3 rounded-panel border bg-card p-4 ${lowest ? "border-2 border-brand" : "border-line"}`}>
            {lowest ? <StatusPill label="Lowest price" tone="brand" /> : null}
            <View className="flex-row items-start justify-between gap-3">
              <Avatar name={p.fullName} url={p.avatarUrl} size={52} />
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-1">
                  <Text className="flex-shrink text-lg font-bold text-fg">{p.fullName}{p.isVerified ? "  ✓" : ""}</Text>
                  {p.isVerified ? <BadgeCheck size={18} color={colors.brand} accessibilityLabel="Verified" /> : null}
                </View>
                <Text className="text-sm text-muted">
                  ★ {formatRating(p.rating)}{p.totalReviews ? ` (${p.totalReviews})` : ""}  ·  {p.totalJobs} jobs
                  {p.experienceYears ? `  ·  ${p.experienceYears} yr exp` : ""}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-2xl font-extrabold text-price">{formatInr(p.price)}</Text>
                <Text className="text-xs text-muted">final price</Text>
              </View>
            </View>
            {p.distanceKm !== null ? <Text className="text-sm text-muted">About {formatDistance(p.distanceKm)} away</Text> : null}
            {p.bio ? <Text className="text-sm text-muted" numberOfLines={2}>{p.bio}</Text> : null}
            <Button label={`Book ${p.fullName.split(" ")[0]}`} onPress={() => book(p)} />
          </View>
        );
      }) : null}
      {!needsSubItem && sorted.length > 0 ? (
        <View className="flex-row items-center justify-center gap-1.5 py-1">
          <Lock size={14} color={colors.muted} />
          <Text className="text-xs text-muted">The price you see is the price you pay</Text>
        </View>
      ) : null}
    </Screen>
  );
}
