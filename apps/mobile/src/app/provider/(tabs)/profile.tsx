import { formatRating, launchStatus, maskAccountNumber } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  Bell, Briefcase, Info, Trash2, CalendarClock, Camera, ChevronRight, CircleHelp, Gift, IdCard, Landmark, LogOut, MapPin, ShoppingBag, Star, Wallet, Wrench,
} from "lucide-react-native";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { MenuGroup, MenuRow } from "@/components/menu";
import { Text } from "@/components/text";
import { ErrorBanner, InfoBanner, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { fetchServices } from "@/features/customer/catalog-api";
import { fetchProviderProfile, providerProfileKey } from "@/features/provider/profile-api";
import { env } from "@/lib/env";
import { useThemeColors } from "@/theme/theme";
import { ScreenBackground } from "@/components/screen-background";
import { AppearancePicker } from "@/components/appearance-picker";

const KYC_LABEL: Record<string, string> = {
  approved: "Verified",
  pending: "Under review",
  rejected: "Needs changes",
  not_submitted: "Not submitted",
};

const toNumber = (v: number | string | null | undefined): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export default function ProviderProfile() {
  const colors = useThemeColors();
  const router = useRouter();
  const { provider, email, signOut } = useSession();
  const profile = useQuery({
    queryKey: providerProfileKey(provider?.id ?? ""),
    queryFn: () => fetchProviderProfile(provider!.id),
    enabled: !!provider,
  });
  const services = useQuery({ queryKey: ["services"], queryFn: fetchServices });
  const p = profile.data;

  const name = p?.full_name ?? provider?.full_name ?? "Your name";
  const kyc = provider?.kyc_status ?? "not_submitted";
  const areas = p?.pincodes ?? [];
  const serviceNames = (p?.service_ids ?? []).map((id) => services.data?.find((s) => s.id === id)?.name).filter((n): n is string => !!n);
  const payout = [p?.upi_id, maskAccountNumber(p?.bank_account_number)].filter(Boolean).join(" · ");
  const missing = p && (!areas.length || !serviceNames.length);

  const rating = toNumber(provider?.rating);
  const acceptance = toNumber(provider?.acceptance_rate);
  const jobs = provider?.total_jobs ?? 0;
  const launch = launchStatus({
    launchStartedAt: provider?.kyc_reviewed_at && kyc === "approved" ? new Date(provider.kyc_reviewed_at) : null,
    completedJobs: jobs,
    now: new Date(),
  });

  const edit = () => router.push("/provider/edit-profile");
  const list = (items: string[], empty: string) =>
    items.length ? (items.length > 3 ? `${items.slice(0, 3).join(", ")} +${items.length - 3} more` : items.join(", ")) : empty;

  return (
    <ScreenBackground><SafeAreaView className="flex-1" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}>
        <Title>Profile</Title>
        <ErrorBanner message={profile.isError ? "Could not load your profile." : null} />

        {/* Who you are + how you are doing */}
        <View className="overflow-hidden rounded-panel border border-line bg-card">
          <Pressable accessibilityRole="button" accessibilityLabel={`${name}, edit profile`} onPress={edit}
            className="flex-row items-center gap-4 p-4 active:bg-field">
            <View>
              <Avatar name={name} url={p?.avatar_url} size={64} />
              <View className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-brand">
                <Camera size={12} color={colors.onBrand} />
              </View>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-lg font-bold text-fg" numberOfLines={1}>{name}</Text>
              <Text className="text-sm text-muted">{p?.phone ?? provider?.phone ? `+91 ${p?.phone ?? provider?.phone}` : "Add your mobile number"}</Text>
              <View className={`mt-1 self-start rounded-full px-2 py-0.5 ${kyc === "approved" ? "bg-ok/15" : "bg-brand/15"}`}>
                <Text className={`text-xs font-semibold ${kyc === "approved" ? "text-ok" : "text-brand"}`}>{KYC_LABEL[kyc] ?? kyc}</Text>
              </View>
            </View>
            <ChevronRight size={22} color={colors.fg} />
          </Pressable>
          <View className="flex-row bg-strip py-4">
            <Stat value={rating && rating > 0 ? `${formatRating(rating)}★` : "New"} label="Rating" />
            <Stat value={String(jobs)} label={jobs === 1 ? "Job done" : "Jobs done"} />
            <Stat value={acceptance != null ? `${Math.round(acceptance)}%` : "–"} label="Accepted" />
          </View>
        </View>

        <InfoBanner message={missing ? "Add your work areas and services so customers can find you." : null} />
        {launch.active ? (
          <View className="flex-row items-center gap-3 rounded-tile border border-brand/30 bg-brand-soft p-4">
            <Gift size={22} color={colors.brand} />
            <Text className="flex-1 text-sm text-fg">
              <Text className="font-bold text-brand">Fee-free launch: </Text>
              {launch.jobsLeft} {launch.jobsLeft === 1 ? "job" : "jobs"} or {launch.daysLeft} {launch.daysLeft === 1 ? "day" : "days"} left, whichever comes first.
            </Text>
          </View>
        ) : null}

        <Text className="text-sm font-semibold uppercase tracking-wider text-muted">Your work</Text>
        <MenuGroup>
          <MenuRow icon={MapPin} label="Work areas" detail={list(areas, "Add the cities or pincodes you cover")} onPress={edit} />
          <MenuRow icon={Wrench} label="Services I offer" detail={list(serviceNames, "Pick the services and jobs you do")} onPress={() => router.push("/provider/services")} />
          <MenuRow icon={CalendarClock} label="Working hours" detail="When customers can book you" onPress={() => router.push("/provider/schedule")} />
          <MenuRow icon={Briefcase} label="My jobs" onPress={() => router.push("/provider/jobs")} />
          <MenuRow icon={Star} label="My reviews" detail={rating && rating > 0 ? `${formatRating(rating)}★ from customers` : "What customers say about you"} onPress={() => router.push("/provider/reviews")} />
        </MenuGroup>

        <Text className="text-sm font-semibold uppercase tracking-wider text-muted">Money</Text>
        <MenuGroup>
          <MenuRow icon={Wallet} label="Wallet & earnings" detail="Top up, fees and withdrawals" onPress={() => router.push("/provider/wallet")} />
          <MenuRow icon={Landmark} label="Payout details" detail={payout || "Add UPI or bank to withdraw"} onPress={() => router.push("/provider/wallet")} />
        </MenuGroup>

        <Text className="text-sm font-semibold uppercase tracking-wider text-muted">Account</Text>
        <MenuGroup>
          <MenuRow icon={IdCard} label="Identity check" detail={KYC_LABEL[kyc] ?? kyc} onPress={() => router.push("/provider/kyc")} />
          <MenuRow icon={Bell} label="Notifications" onPress={() => router.push("/provider/notifications")} />
          <MenuRow icon={CircleHelp} label="Help & support" detail="Fees, requests and payouts" onPress={() => router.push("/provider/help")} />
          <MenuRow icon={Info} label="About HandyFix" onPress={() => router.push("/provider/about")} />
          {env.customerAppUrl ? (
            <MenuRow icon={ShoppingBag} label="Book a service for yourself" detail="Get the HandyFix app" onPress={() => void Linking.openURL(env.customerAppUrl)} />
          ) : null}
        </MenuGroup>

        <AppearancePicker />

        <MenuGroup>
          <MenuRow icon={LogOut} label="Sign out" danger onPress={() => void signOut()} />
          <MenuRow icon={Trash2} label="Delete account" danger onPress={() => router.push("/provider/delete-account")} />
        </MenuGroup>

        <Text className="text-center text-xs text-muted">{email ? `${email} · ` : ""}HandyFix Pro {Constants.expoConfig?.version ?? ""}</Text>
      </ScrollView>
    </SafeAreaView></ScreenBackground>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className="text-xl font-extrabold text-strip-fg">{value}</Text>
      <Text className="text-xs text-strip-fg opacity-80">{label}</Text>
    </View>
  );
}
