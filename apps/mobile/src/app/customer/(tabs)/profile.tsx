import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { BriefcaseBusiness, CalendarCheck, ChevronRight, CircleHelp, House, LogOut, ShieldCheck, type LucideIcon } from "lucide-react-native";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MenuGroup, MenuRow } from "@/components/menu";
import { Text } from "@/components/text";
import { Title } from "@/components/ui";
import { loadCustomerProfile, loadEmailVerified } from "@/features/auth/api";
import { EmailVerificationCard } from "@/features/auth/EmailVerificationCard";
import { useSession } from "@/features/auth/session-provider";
import { fetchCustomerBookings } from "@/features/customer/booking-api";
import { env } from "@/lib/env";
import { colors } from "@/theme/colors";

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";

/** A screen can still be mounted for one render while signing out, so never assume a user here. */
export default function CustomerProfile() {
  const { userId } = useSession();
  return userId ? <ProfileMenu userId={userId} /> : null;
}

function ProfileMenu({ userId }: { userId: string }) {
  const router = useRouter();
  const { email, fullName, signOut } = useSession();
  const profile = useQuery({ queryKey: ["customer-profile", userId], queryFn: () => loadCustomerProfile(userId) });
  const verified = useQuery({ queryKey: ["email-verified", userId], queryFn: loadEmailVerified });
  const bookings = useQuery({ queryKey: ["customer-bookings", userId], queryFn: () => fetchCustomerBookings(userId) });

  const p = profile.data;
  const name = p?.full_name ?? fullName ?? "Your name";
  const address = [p?.address, p?.city, p?.pincode].filter(Boolean).join(", ");
  const total = bookings.data?.length ?? 0;
  const done = (bookings.data ?? []).filter((b) => b.status === "completed").length;
  const editProfile = () => router.push("/customer/edit-profile");

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}>
        <Title>Profile</Title>

        {/* Who you are: tap to edit */}
        <View className="overflow-hidden rounded-3xl border border-line bg-card">
          <Pressable accessibilityRole="button" accessibilityLabel={`${name}, edit profile`} onPress={editProfile}
            className="flex-row items-center gap-4 p-4 active:bg-field">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand">
              <Text className="text-2xl font-bold text-white">{initials(name)}</Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-lg font-bold text-fg" numberOfLines={1}>{name}</Text>
              <Text className={`text-sm ${p?.phone ? "text-muted" : "text-brand"}`}>{p?.phone ? `+91 ${p.phone}` : "Add your mobile number"}</Text>
              {email ? <Text className="text-sm text-muted" numberOfLines={1}>{email}{verified.data ? "  ✓" : ""}</Text> : null}
            </View>
            <ChevronRight size={22} color={colors.fg} />
          </Pressable>
          <View className="h-px bg-line" />
          <Stat icon={CalendarCheck} onPress={() => router.push("/customer/bookings")}
            label={bookings.isSuccess ? `${total} ${total === 1 ? "booking" : "bookings"}${done ? ` · ${done} completed` : ""}` : "My bookings"} />
        </View>

        {/* Booking is blocked until the email is verified, so the prompt stays visible here. */}
        {verified.isSuccess && !verified.data ? <EmailVerificationCard userId={userId} email={email} /> : null}

        <MenuGroup>
          <MenuRow icon={CalendarCheck} label="My bookings" onPress={() => router.push("/customer/bookings")} />
          <MenuRow icon={House} label="Saved address" detail={address || "Add your home address"} onPress={editProfile} />
          <MenuRow icon={CircleHelp} label="Help & support" onPress={() => router.push("/customer/help")} />
          <MenuRow icon={ShieldCheck} label="Safety" onPress={() => router.push("/customer/safety")} />
        </MenuGroup>

        {env.proAppUrl ? (
          <MenuGroup>
            <MenuRow icon={BriefcaseBusiness} label="Become a HandyFix Pro" detail="Earn with your skills" onPress={() => void Linking.openURL(env.proAppUrl)} />
          </MenuGroup>
        ) : null}

        <MenuGroup>
          <MenuRow icon={LogOut} label="Sign out" danger onPress={() => void signOut()} />
        </MenuGroup>

        <Text className="text-center text-xs text-muted">HandyFix {Constants.expoConfig?.version ?? ""}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="min-h-[52px] flex-row items-center gap-3 px-4 active:bg-field">
      <Icon size={20} color={colors.brand} />
      <Text className="flex-1 text-base font-medium text-fg">{label}</Text>
      <ChevronRight size={20} color={colors.fg} />
    </Pressable>
  );
}
