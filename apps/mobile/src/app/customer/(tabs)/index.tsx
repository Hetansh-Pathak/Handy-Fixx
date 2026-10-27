import { formatDuration, formatInr, serviceEmoji } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Body, Button, ErrorBanner, Screen, TextField, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { useArea } from "@/features/customer/area-context";
import { fetchServices } from "@/features/customer/catalog-api";

export default function CustomerHome() {
  const router = useRouter();
  const { fullName } = useSession();
  const { area, setArea } = useArea();
  const [search, setSearch] = useState("");
  const services = useQuery({ queryKey: ["services"], queryFn: fetchServices, staleTime: 5 * 60_000 });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (services.data ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
  }, [services.data, search]);

  return (
    <Screen>
      <Title>Hi{fullName ? `, ${fullName.split(" ")[0]}` : ""}</Title>
      <Body muted>What do you need fixed today?</Body>
      <TextField label="Your area" value={area} onChangeText={setArea} placeholder="City or 6-digit pincode"
        hint="We show pros who cover this area." autoCapitalize="words" autoComplete="postal-code" />
      <TextField label="Search services" value={search} onChangeText={setSearch} placeholder="Plumbing, cleaning…" autoCapitalize="none" />
      <ErrorBanner message={services.isError ? "Could not load services." : null} />
      {services.isError ? <Button label="Try again" variant="secondary" onPress={() => void services.refetch()} /> : null}
      {services.isPending ? <Body muted>Loading services…</Body> : null}
      {services.isSuccess && visible.length === 0 ? <Body muted>No services match “{search}”.</Body> : null}
      {visible.map((s) => (
        <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={s.name}
          onPress={() => router.push({ pathname: "/customer/service/[slug]", params: { slug: s.slug } })}
          className="flex-row items-center gap-4 rounded-2xl border border-line bg-surface p-4 active:opacity-80">
          <Text className="text-3xl">{serviceEmoji(s.icon_name)}</Text>
          <View className="flex-1 gap-0.5">
            <Text className="text-lg font-semibold text-white">{s.name}</Text>
            {s.description ? <Text className="text-sm text-muted" numberOfLines={2}>{s.description}</Text> : null}
            <Text className="text-sm text-gold">
              {s.base_price ? `From ${formatInr(s.base_price)}` : "Price on request"}
              {s.duration_minutes ? `  ·  ~${formatDuration(s.duration_minutes)}` : ""}
            </Text>
          </View>
          <Text className="text-2xl text-muted">›</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
