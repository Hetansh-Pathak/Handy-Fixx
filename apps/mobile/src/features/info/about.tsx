import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { BadgeIndianRupee, Lock, MapPin, ShieldCheck } from "lucide-react-native";
import { Linking, View } from "react-native";
import { IconTile, Logo } from "@/components/brand";
import { MenuGroup, MenuRow } from "@/components/menu";
import { Text } from "@/components/text";
import { Body, Card, Screen, ScreenHeader } from "@/components/ui";
import { env } from "@/lib/env";
import { colors } from "@/theme/colors";

const POINTS = [
  { icon: ShieldCheck, title: "Checked pros", text: "Every pro passes an identity check (Aadhaar, PAN and a selfie) reviewed by our team before taking jobs." },
  { icon: BadgeIndianRupee, title: "One price, ₹0 for you", text: "You pay the price you saw, directly to the pro by UPI or cash. HandyFix charges customers nothing extra." },
  { icon: Lock, title: "Locked price, approved extras", text: "The price is locked when you book. It only grows if you approve extra work in the app." },
  { icon: MapPin, title: "A record of every job", text: "Live tracking, a 4-digit code to close the job, and a way to report a problem within 24 hours." },
] as const;

export function AboutScreen({ role }: { role: "customer" | "provider" }) {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "";
  return (
    <Screen>
      <ScreenHeader title="About HandyFix" onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <View className="items-center gap-2 py-2"><Logo size={56} /></View>
      <Body>
        HandyFix connects people in tier-2 Indian cities with verified home-service professionals: plumbers, electricians, cleaners, painters and more.
        {role === "provider" ? " You keep what customers pay you; HandyFix takes a small flat fee only on a completed job." : ""}
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
      {env.privacyUrl || env.termsUrl ? (
        <MenuGroup>
          {env.privacyUrl ? <MenuRow icon={Lock} label="Privacy policy" onPress={() => void Linking.openURL(env.privacyUrl)} /> : null}
          {env.termsUrl ? <MenuRow icon={ShieldCheck} label="Terms of use" onPress={() => void Linking.openURL(env.termsUrl)} /> : null}
        </MenuGroup>
      ) : null}
      <Text className="text-center text-xs text-muted">HandyFix {role === "provider" ? "Pro " : ""}{version}</Text>
    </Screen>
  );
}
