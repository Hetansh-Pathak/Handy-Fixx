import Constants from "expo-constants";
import { APP_NAME, APP_NAME_PRO } from "@handyfix/shared";
import { useRouter } from "expo-router";
import { BadgeIndianRupee, Lock, MapPin, ShieldCheck } from "lucide-react-native";
import { View } from "react-native";
import { IconTile, Logo } from "@/components/brand";
import { MenuGroup, MenuRow } from "@/components/menu";
import { Text } from "@/components/text";
import { Body, Card, Screen, ScreenHeader } from "@/components/ui";
import { useThemeColors } from "@/theme/theme";

const POINTS = [
  { icon: ShieldCheck, title: "Checked pros", text: "Every pro passes an identity check (PAN, a selfie and a bank or UPI name match) reviewed by our team before taking jobs." },
  { icon: BadgeIndianRupee, title: "One price, ₹0 for you", text: `You pay the price you saw, directly to the pro by UPI or cash. ${APP_NAME} charges customers nothing extra.` },
  { icon: Lock, title: "Locked price, approved extras", text: "The price is locked when you book. It only grows if you approve extra work in the app." },
  { icon: MapPin, title: "A record of every job", text: "Live tracking, a 4-digit code to close the job, and a way to report a problem within 24 hours." },
] as const;

export function AboutScreen({ role }: { role: "customer" | "provider" }) {
  const colors = useThemeColors();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "";
  return (
    <Screen>
      <ScreenHeader title={`About ${APP_NAME}`} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <View className="items-center gap-2 py-2"><Logo size={56} /></View>
      <Body>
        {APP_NAME} connects people in tier-2 Indian cities with verified home-service professionals: plumbers, electricians, cleaners, painters and more.
        {role === "provider" ? ` You keep what customers pay you; ${APP_NAME} takes a small flat fee only on a completed job.` : ""}
      </Body>
      {POINTS.map(({ icon: Icon, title, text }) => (
        <Card key={title}>
          <View className="flex-row items-start gap-3">
            <IconTile size={44}><Icon size={22} color={colors.brand} /></IconTile>
            <View className="flex-1 gap-1">
              <Text className="text-base font-semibold text-fg">{title}</Text>
              <Text className="text-sm text-muted">{text}</Text>
            </View>
          </View>
        </Card>
      ))}
      <MenuGroup>
        <MenuRow icon={Lock} label="Privacy policy" onPress={() => router.push({ pathname: "/legal/[doc]", params: { doc: "privacy" } })} />
        <MenuRow icon={ShieldCheck} label="Terms of use" onPress={() => router.push({ pathname: "/legal/[doc]", params: { doc: "terms" } })} />
      </MenuGroup>
      <Text className="text-center text-xs text-muted">{role === "provider" ? APP_NAME_PRO : APP_NAME} {version}</Text>
    </Screen>
  );
}
