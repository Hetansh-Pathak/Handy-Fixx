import { useQuery } from "@tanstack/react-query";
import { MapPin, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CitySuggestions } from "@/components/CitySuggestions";
import { Text } from "@/components/text";
import { Body, Button, ErrorBanner, Title } from "@/components/ui";
import { useArea } from "@/features/customer/area-context";
import { BannerCarousel } from "@/features/customer/BannerCarousel";
import { fetchServices } from "@/features/customer/catalog-api";
import { loadErrorMessage } from "@/lib/load-error";
import { ServiceGrid } from "@/features/customer/ServiceGrid";
import { groupServices } from "@/features/customer/service-groups";
import { colors } from "@/theme/colors";

const ALL = "All";
const CATEGORY_LABELS: Record<string, string> = { home: "Home", appliance: "Appliances", beauty: "Beauty", help: "Home help" };
const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

export default function AllServices() {
  const { area, setArea } = useArea();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const services = useQuery({ queryKey: ["services"], queryFn: fetchServices, staleTime: 5 * 60_000 });

  const slugs = useMemo(() => new Set((services.data ?? []).map((s) => s.slug)), [services.data]);
  const categories = useMemo(() => {
    const names = new Set<string>();
    (services.data ?? []).forEach((s) => { if (s.category) names.add(s.category); });
    return [ALL, ...names];
  }, [services.data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (services.data ?? []).filter(
      (s) => (category === ALL || s.category === category) && (!q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)),
    );
  }, [services.data, search, category]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 20 }}>
        <Title>All services</Title>
        <BannerCarousel availableSlugs={slugs} />

        <View className="gap-3">
          <View className="flex-row items-center gap-2 rounded-2xl border border-line bg-field px-3">
            <MapPin size={18} color={colors.muted} />
            <TextInput accessibilityLabel="Your area" value={area} onChangeText={setArea} placeholder="Your city or 6-digit pincode"
              placeholderTextColor={colors.mutedSoft} autoCapitalize="words" style={{ fontFamily: "PlusJakartaSans_400Regular" }}
              className="min-h-[48px] flex-1 text-base text-fg" />
          </View>
          <CitySuggestions query={area} onPick={setArea} />
          <View className="flex-row items-center gap-2 rounded-2xl border border-line bg-card px-3">
            <Search size={18} color={colors.muted} />
            <TextInput accessibilityLabel="Search services" value={search} onChangeText={setSearch} placeholder="Plumbing, cleaning…"
              placeholderTextColor={colors.mutedSoft} autoCapitalize="none" style={{ fontFamily: "PlusJakartaSans_400Regular" }}
              className="min-h-[48px] flex-1 text-base text-fg" />
          </View>
        </View>

        {categories.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {categories.map((c) => (
              <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: category === c }} onPress={() => setCategory(c)}
                className={`min-h-[44px] justify-center rounded-xl px-4 ${category === c ? "bg-brand" : "bg-field"}`}>
                <Text className={`text-sm font-semibold ${category === c ? "text-white" : "text-muted"}`}>{c === ALL ? "All services" : categoryLabel(c)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <ErrorBanner message={services.isError ? loadErrorMessage("services", services.error) : null} />
        {services.isError ? <Button label="Try again" variant="secondary" onPress={() => void services.refetch()} /> : null}
        {services.isPending ? <Body muted>Loading services…</Body> : null}
        {services.isSuccess && visible.length === 0 ? <Body muted>No services match “{search}”.</Body> : null}
        {/* With no filter, services sit under headings like "Electrician, Plumber & Carpenter"; a search or category shows one grid. */}
        {category === ALL && !search.trim() ? (
          groupServices(visible).map((g) => (
            <View key={g.title} className="gap-3">
              <Text className="text-xl font-bold text-fg">{g.title}</Text>
              <ServiceGrid services={g.services} />
            </View>
          ))
        ) : (
          <ServiceGrid services={visible} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
