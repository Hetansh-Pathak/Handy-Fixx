import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowRight, Award, BadgeIndianRupee, Clock, Headphones, MapPin, RotateCcw, ShieldCheck, Star, Users, type LucideIcon } from "lucide-react-native";
import { Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eyebrow, IconTile, Logo, SectionHeading } from "@/components/brand";
import { CitySuggestions } from "@/components/CitySuggestions";
import { Text } from "@/components/text";
import { Body, Button, ErrorBanner } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { NotificationBell } from "@/features/notifications/components";
import { useArea } from "@/features/customer/area-context";
import { fetchServices } from "@/features/customer/catalog-api";
import { loadErrorMessage } from "@/lib/load-error";
import { ServiceGrid } from "@/features/customer/ServiceGrid";
import { env } from "@/lib/env";
import { colors } from "@/theme/colors";

const POPULAR_COUNT = 4;

const STATS: { icon: LucideIcon; value: string; label: string }[] = [
  { icon: Users, value: "50,000+", label: "Happy Customers" },
  { icon: BadgeIndianRupee, value: "₹0", label: "Fee for customers" },
  { icon: Star, value: "4.9★", label: "Avg. Rating" },
  { icon: Award, value: "2,000+", label: "Verified Pros" },
];

const STEPS = [
  { title: "Find Your Job", desc: "Browse services and describe what you need." },
  { title: "Get Matched", desc: "We'll connect you with a top-rated pro nearby." },
  { title: "Job Done", desc: "Your expert completes the job to your satisfaction." },
];

const WHY: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: ShieldCheck, title: "Verified & Vetted", desc: "Every pro passes an identity check before taking jobs." },
  { icon: MapPin, title: "Live GPS Tracking", desc: "Track your pro in real time on the way to your home." },
  { icon: Clock, title: "Upfront Pricing", desc: "No hidden fees. Know the price before booking." },
  { icon: Headphones, title: "Support", desc: "Our team is here if something goes wrong." },
  { icon: BadgeIndianRupee, title: "Pay the Pro Directly", desc: "Pay by UPI or cash once the job is done." },
  { icon: RotateCcw, title: "Fair Disputes", desc: "Raise a problem within 24 hours and we step in." },
];

const REVIEWS = [
  { name: "Priya Sharma", role: "Homeowner", text: "HandyFix saved my weekend! The plumber arrived in 30 minutes and fixed everything perfectly. Highly recommend!" },
  { name: "Rahul Mehta", role: "Business Owner", text: "I use HandyFix for all my office repairs. Reliable, fast, and their pricing is always transparent." },
  { name: "Kavya Iyer", role: "Apartment Renter", text: "Finally a service app that actually works. Knew exactly when my pro would arrive. The cleaning was spotless!" },
];

export default function CustomerHome() {
  const router = useRouter();
  const { fullName } = useSession();
  const { area, setArea } = useArea();
  const services = useQuery({ queryKey: ["services"], queryFn: fetchServices, staleTime: 5 * 60_000 });
  const popular = (services.data ?? []).slice(0, POPULAR_COUNT);
  const showServices = () => router.push("/customer/services");

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="flex-row items-center justify-between px-5 py-3">
          <Logo />
          <View className="flex-row items-center gap-3">
            {fullName ? <Text className="text-sm font-medium text-muted">Hi, {fullName.split(" ")[0]}</Text> : null}
            <NotificationBell role="customer" />
          </View>
        </View>

        {/* Hero */}
        <View className="gap-4 px-5 pb-6 pt-4">
          <Eyebrow>#1 Home services marketplace</Eyebrow>
          <Text className="text-4xl font-extrabold leading-tight text-fg">
            Your Home, <Text className="text-brand">Fixed Fast.</Text>
            {"\n"}<Text className="text-brand">Guaranteed.</Text>
          </Text>
          <Text className="text-base leading-6 text-muted">
            Book verified professionals for any home service. From plumbing to painting, done right, on time, every time.
          </Text>
          <Text className="text-sm font-medium text-fg">What do you need fixed today?</Text>
          <View className="flex-row items-center gap-2 rounded-2xl border border-line bg-field p-2">
            <MapPin size={20} color={colors.muted} style={{ marginLeft: 8 }} />
            <TextInput
              accessibilityLabel="Your area"
              value={area}
              onChangeText={setArea}
              placeholder="City or 6-digit pincode"
              placeholderTextColor={colors.mutedSoft}
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
              className={`h-11 w-11 items-center justify-center rounded-xl active:opacity-80 ${area.trim() ? "bg-brand" : "border border-brand/30 bg-brand-soft"}`}>
              <ArrowRight size={20} color={area.trim() ? colors.white : colors.brand} />
            </Pressable>
          </View>
          <CitySuggestions query={area} onPick={setArea} />
          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <View className="flex-row items-center gap-1.5"><ShieldCheck size={16} color={colors.brand} /><Text className="text-sm text-muted">Verified Pros</Text></View>
            <View className="flex-row items-center gap-1.5"><Star size={16} color={colors.brand} /><Text className="text-sm text-muted">4.9 Avg Rating</Text></View>
            <Text className="text-sm font-semibold text-brand">50,000+ bookings</Text>
          </View>
        </View>

        {/* Stats strip */}
        <View className="flex-row flex-wrap bg-strip px-3 py-8">
          {STATS.map(({ icon: Icon, value, label }) => (
            <View key={label} className="w-1/2 items-center gap-2 py-4">
              <View className="h-14 w-14 items-center justify-center rounded-full border border-brand/40 bg-brand/20"><Icon size={24} color={colors.brand} /></View>
              <Text className="text-3xl font-extrabold text-white">{value}</Text>
              <Text className="text-sm text-white/70">{label}</Text>
            </View>
          ))}
        </View>

        {/* Popular services: the full list with search and categories is the Services tab */}
        <View className="gap-5 px-5 pt-10" accessibilityLabel="Popular services">
          <SectionHeading title="Every home service, one tap away" subtitle="Trusted professionals for every corner of your home" />
          <ErrorBanner message={services.isError ? loadErrorMessage("services", services.error) : null} />
          {services.isError ? <Button label="Try again" variant="secondary" onPress={() => void services.refetch()} /> : null}
          {services.isPending ? <Body muted>Loading services…</Body> : null}
          <ServiceGrid services={popular} />
          {services.isSuccess && services.data.length > popular.length ? (
            <Button label={`See all ${services.data.length} services`} variant="secondary" onPress={() => router.push("/customer/services")} />
          ) : null}
        </View>

        {/* How it works */}
        <View className="gap-6 px-5 pt-14">
          <SectionHeading title="How HandyFix works" subtitle="Three simple steps to a fixed home" />
          {STEPS.map((step, i) => (
            <View key={step.title} className="items-center gap-2">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brand"><Text className="text-xl font-bold text-white">{i + 1}</Text></View>
              <Text className="text-xl font-bold text-fg">{step.title}</Text>
              <Text className="text-center text-base text-muted">{step.desc}</Text>
            </View>
          ))}
        </View>

        {/* Why choose */}
        <View className="gap-4 px-5 pt-14">
          <SectionHeading title="Why choose HandyFix" />
          {WHY.map(({ icon: Icon, title, desc }) => (
            <View key={title} className="flex-row items-start gap-4 rounded-3xl border border-line bg-card p-5">
              <IconTile size={48}><Icon size={22} color={colors.brand} /></IconTile>
              <View className="flex-1 gap-1">
                <Text className="text-lg font-bold text-fg">{title}</Text>
                <Text className="text-sm leading-5 text-muted">{desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Testimonials */}
        <View className="gap-4 px-5 pt-14">
          <SectionHeading title="Loved by homeowners" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {REVIEWS.map((r) => (
              <View key={r.name} className="w-72 gap-3 rounded-3xl border border-line bg-card p-5">
                <View className="flex-row gap-0.5">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={16} color={colors.sun} fill={colors.sun} />)}</View>
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
        <View className="mx-5 mt-14 gap-3 rounded-3xl bg-strip p-6">
          <Text className="text-sm font-semibold uppercase tracking-wider text-brand">Join 2,000+ pros</Text>
          <Text className="text-2xl font-extrabold text-white">Turn your skills into daily income</Text>
          <Text className="text-base leading-6 text-white/70">Pros keep what customers pay them. HandyFix charges a small flat fee per completed job, and nothing for missed requests.</Text>
          {env.proAppUrl ? <Button label="Get the HandyFix Pro app" onPress={() => void Linking.openURL(env.proAppUrl)} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
