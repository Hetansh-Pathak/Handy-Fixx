import { formatDuration, formatInr } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowRight, BadgeIndianRupee, Lock, MapPin, ShieldCheck, Star } from "lucide-react-native";
import { useRef, type ComponentRef } from "react";
import { Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconTile, Logo, SectionHeading, ServiceIcon } from "@/components/brand";
import { CitySuggestions } from "@/components/CitySuggestions";
import { ScreenBackground } from "@/components/screen-background";
import { Text } from "@/components/text";
import { Button, ErrorBanner, HeroCard, ListSkeleton } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { NotificationBell } from "@/features/notifications/components";
import { useArea } from "@/features/customer/area-context";
import { fetchServices } from "@/features/customer/catalog-api";
import type { ServiceRow } from "@/features/customer/types";
import { loadErrorMessage } from "@/lib/load-error";
import { env } from "@/lib/env";
import { useThemeColors } from "@/theme/theme";

const POPULAR_COUNT = 8;

const STEPS = [
  { title: "Find Your Job", desc: "Browse services and describe what you need." },
  { title: "Get Matched", desc: "We'll connect you with a top-rated pro nearby." },
  { title: "Job Done", desc: "Your expert completes the job to your satisfaction." },
];

const TRUST = [
  { icon: ShieldCheck, title: "Verified pros", desc: "Identity checked" },
  { icon: MapPin, title: "Live tracking", desc: "See them on the way" },
  { icon: BadgeIndianRupee, title: "Pay the pro", desc: "UPI or cash, after" },
] as const;

const REVIEWS = [
  { name: "Priya Sharma", role: "Homeowner", text: "HandyFix saved my weekend! The plumber arrived in 30 minutes and fixed everything perfectly. Highly recommend!" },
  { name: "Rahul Mehta", role: "Business Owner", text: "I use HandyFix for all my office repairs. Reliable, fast, and their pricing is always transparent." },
  { name: "Kavya Iyer", role: "Apartment Renter", text: "Finally a service app that actually works. Knew exactly when my pro would arrive. The cleaning was spotless!" },
];

/** Compact 4-column service tiles for the home screen (the full cards are on the Services tab). */
function ServiceTiles({ services }: { services: readonly ServiceRow[] }) {
  const router = useRouter();
  return (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
      {services.map((s) => (
        <View key={s.id} style={{ width: "25%", padding: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={s.name}
            onPress={() => router.push({ pathname: "/customer/service/[slug]", params: { slug: s.slug } })}
            className="min-h-[132px] items-center gap-1 rounded-tile border border-line bg-card px-1 py-3 active:opacity-80">
            <IconTile size={40}><ServiceIcon name={s.icon_name} size={22} /></IconTile>
            <Text className="text-center text-xs font-semibold text-fg" numberOfLines={2}>{s.name}</Text>
            <Text className="text-center text-xs font-bold text-price">{s.base_price ? `Starts at ${formatInr(s.base_price)}` : "On request"}</Text>
            {s.duration_minutes ? <Text className="text-xs text-muted">{formatDuration(s.duration_minutes)}</Text> : null}
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export default function CustomerHome() {
  const colors = useThemeColors();
  const router = useRouter();
  const { fullName } = useSession();
  const { area, setArea } = useArea();
  const areaInput = useRef<ComponentRef<typeof TextInput>>(null);
  const services = useQuery({ queryKey: ["services"], queryFn: fetchServices, staleTime: 5 * 60_000 });
  const popular = (services.data ?? []).slice(0, POPULAR_COUNT);
  const showServices = () => router.push("/customer/services");

  return (
    <ScreenBackground>
      <SafeAreaView className="flex-1" edges={["top"]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
          <View className="flex-row items-center justify-between px-5 py-3">
            <Logo size={34} />
            <View className="flex-row items-center gap-2">
              <Pressable accessibilityRole="button" accessibilityLabel={area.trim() ? `Area: ${area.trim()}` : "Choose your area"}
                onPress={() => areaInput.current?.focus()}
                className="min-h-[44px] max-w-[130px] flex-row items-center gap-1 rounded-full bg-tint px-3 active:opacity-80">
                <MapPin size={14} color={colors.tintFg} />
                <Text className="text-xs font-semibold text-tint-fg" numberOfLines={1}>{area.trim() || "Your area"}</Text>
              </Pressable>
              <NotificationBell role="customer" />
            </View>
          </View>

          {/* Hero */}
          <View className="gap-4 px-5 pb-2 pt-3">
            {fullName ? <Text className="text-sm font-medium text-muted">Hi, {fullName.split(" ")[0]}</Text> : null}
            <Text className="text-4xl font-extrabold leading-tight tracking-tight text-fg">
              Apna banda <Text className="text-4xl font-extrabold text-brand">hai.</Text>
            </Text>
            <Text className="text-base leading-6 text-muted">
              Book verified professionals for any home service. From plumbing to painting, done right, on time, every time.
            </Text>
            <Text className="text-base font-semibold text-fg">What do you need fixed today?</Text>
            <HeroCard className="p-2">
              {/* Own row View: on web the blur layer would otherwise paint over a TextInput that is a direct child. */}
              <View className="flex-row items-center gap-2">
              <MapPin size={20} color={colors.muted} style={{ marginLeft: 8 }} />
              <TextInput
                ref={areaInput}
                accessibilityLabel="Your area"
                value={area}
                onChangeText={setArea}
                placeholder="City or 6-digit pincode"
                placeholderTextColor={colors.mutedSoft}
                selectionColor={colors.brand}
                autoCapitalize="words"
                autoComplete="postal-code"
                returnKeyType="go"
                onSubmitEditing={showServices}
                style={{ fontFamily: "PlusJakartaSans_400Regular" }}
                className="min-h-[44px] flex-1 px-2 text-base text-fg"
              />
              {/* Go: the Services tab lists everything for this area (the area is shared through useArea). */}
              <Pressable accessibilityRole="button" accessibilityLabel={area.trim() ? `Show services in ${area.trim()}` : "Show all services"}
                onPress={showServices} hitSlop={6}
                className={`h-11 w-11 items-center justify-center rounded-tile active:opacity-80 ${area.trim() ? "bg-brand" : "bg-tint"}`}>
                <ArrowRight size={20} color={area.trim() ? colors.onBrand : colors.tintFg} />
              </Pressable>
              </View>
            </HeroCard>
            <CitySuggestions query={area} onPick={setArea} />

            {/* Promise card */}
            <View className="gap-1 rounded-panel bg-brand p-5">
              <View className="flex-row items-center gap-2">
                <Lock size={18} color={colors.onBrand} />
                <Text className="text-lg font-extrabold text-onbrand">₹0 platform fee. One locked price.</Text>
              </View>
              <Text className="text-sm leading-5 text-onbrand opacity-90">The price you see is the price you pay. You pay the pro directly, by UPI or cash.</Text>
            </View>
          </View>

          {/* Popular services: the full list with search and categories is the Services tab */}
          <View className="gap-4 px-5 pt-6" accessibilityLabel="Popular services">
            <Text className="text-xl font-extrabold tracking-tight text-fg">Every home service, one tap away</Text>
            <ErrorBanner message={services.isError ? loadErrorMessage("services", services.error) : null} />
            {services.isError ? <Button label="Try again" variant="secondary" onPress={() => void services.refetch()} /> : null}
            {services.isPending ? <ListSkeleton rows={2} /> : null}
            <ServiceTiles services={popular} />
            {services.isSuccess && services.data.length > popular.length ? (
              <Button label={`See all ${services.data.length} services`} variant="secondary" onPress={() => router.push("/customer/services")} />
            ) : null}
          </View>

          {/* Trust tiles */}
          <View className="flex-row gap-2 px-5 pt-6">
            {TRUST.map(({ icon: Icon, title, desc }) => (
              <View key={title} className="flex-1 items-center gap-1 rounded-tile border border-line bg-card px-2 py-3">
                <Icon size={22} color={colors.brand} />
                <Text className="text-center text-xs font-bold text-fg">{title}</Text>
                <Text className="text-center text-xs text-muted">{desc}</Text>
              </View>
            ))}
          </View>

          {/* How it works */}
          <View className="gap-4 px-5 pt-12">
            <SectionHeading title="How HandyFix works" subtitle="Three simple steps to a fixed home" />
            {STEPS.map((step, i) => (
              <View key={step.title} className="flex-row items-center gap-4 rounded-panel border border-line bg-card p-4">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-brand"><Text className="text-lg font-bold text-onbrand">{i + 1}</Text></View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-fg">{step.title}</Text>
                  <Text className="text-sm text-muted">{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Testimonials */}
          <View className="gap-4 px-5 pt-12">
            <SectionHeading title="Loved by homeowners" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {REVIEWS.map((r) => (
                <View key={r.name} className="w-72 gap-3 rounded-panel border border-line bg-card p-5">
                  <View className="flex-row gap-0.5">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={16} color={colors.accent} fill={colors.accent} />)}</View>
                  <Text className="text-base leading-6 text-fg">“{r.text}”</Text>
                  <View>
                    <Text className="text-base font-bold text-fg">{r.name}</Text>
                    <Text className="text-sm text-muted">{r.role}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Become a pro */}
          <View className="mx-5 mt-12 gap-3 rounded-hero bg-strip p-6">
            <Text className="text-sm font-semibold uppercase tracking-wider text-accent">Join 2,000+ pros</Text>
            <Text className="text-2xl font-extrabold text-strip-fg">Turn your skills into daily income</Text>
            <Text className="text-base leading-6 text-strip-fg opacity-80">Pros keep what customers pay them. HandyFix charges a small fee per completed job, and nothing for missed requests.</Text>
            {env.proAppUrl ? <Button label="Get the HandyFix Pro app" onPress={() => void Linking.openURL(env.proAppUrl)} /> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}
