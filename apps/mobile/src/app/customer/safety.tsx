import { useRouter } from "expo-router";
import { BadgeIndianRupee, KeyRound, MapPin, Phone, PhoneOff, ShieldCheck, type LucideIcon } from "lucide-react-native";
import { Linking, View } from "react-native";
import { IconTile } from "@/components/brand";
import { Text } from "@/components/text";
import { Button, Screen, ScreenHeader } from "@/components/ui";
import { colors } from "@/theme/colors";

const POINTS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ShieldCheck, title: "Verified pros", body: "Every pro passes an identity check before they can take a job." },
  { icon: PhoneOff, title: "Your number stays private", body: "Your pro sees your phone number only after accepting your booking." },
  { icon: MapPin, title: "Live tracking", body: "Follow your pro on the way to your home from the booking screen." },
  { icon: KeyRound, title: "Keep your code until the end", body: "Share the 4-digit completion code only when the job is done to your satisfaction." },
  { icon: BadgeIndianRupee, title: "Pay only after the job", body: "Never pay in advance. Pay your pro directly by UPI or cash once the work is finished." },
];

export default function Safety() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader title="Safety" onBack={() => router.back()} />
      {POINTS.map(({ icon: Icon, title, body }) => (
        <View key={title} className="flex-row items-start gap-4 rounded-3xl border border-line bg-card p-4">
          <IconTile size={48}><Icon size={22} color={colors.brand} /></IconTile>
          <View className="flex-1 gap-1">
            <Text className="text-base font-bold text-fg">{title}</Text>
            <Text className="text-sm leading-5 text-muted">{body}</Text>
          </View>
        </View>
      ))}
      <View className="gap-2 rounded-3xl bg-strip p-5">
        <View className="flex-row items-center gap-2">
          <Phone size={18} color={colors.white} />
          <Text className="text-base font-bold text-white">In an emergency</Text>
        </View>
        <Text className="text-sm leading-5 text-white/70">If you ever feel unsafe, call the national emergency number right away.</Text>
        <Button label="Call 112" variant="danger" onPress={() => void Linking.openURL("tel:112")} />
      </View>
    </Screen>
  );
}
