import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp, Mail, Phone } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { MenuGroup, MenuRow } from "@/components/menu";
import { Text } from "@/components/text";
import { Body, Screen, ScreenHeader } from "@/components/ui";
import { env } from "@/lib/env";
import { useThemeColors } from "@/theme/theme";

// Answers follow the business model: ₹0 customer fee, pay the pro directly, price locked at booking.
const FAQ = [
  { q: "How do I pay?", a: "Pay your pro directly by UPI or cash after the job is done. apnabanda charges customers no booking fee." },
  { q: "Can the price change?", a: "No. The price you see is locked when you book. It only goes up if you approve extra work the pro suggests." },
  { q: "What if the pro does not accept?", a: "Your pro is notified and reviews your request, photos and voice note before accepting. If they decline, or you would rather not wait, we show you the next best pros for the same time." },
  { q: "How do I cancel?", a: "Open the booking and tap Cancel. You can cancel while it is waiting for the pro or confirmed. If your pro has already accepted and the start is less than 2 hours away, it counts as a late cancellation: 3 late cancellations in 30 days pause booking for a week." },
  { q: "Can I chat with my pro?", a: "Yes, once your pro accepts. For your safety, phone numbers cannot be shared in chat; use the Call button on the booking." },
  { q: "What is the 4-digit code?", a: "It appears in your booking once the pro is working. Share it only when the job is finished: it marks the job as done." },
  { q: "Something went wrong", a: "Email us within 24 hours of the job (48 hours for repair quality) with your booking details. We decide within 48 hours." },
];

export default function Help() {
  const colors = useThemeColors();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(0);
  const mail = () => void Linking.openURL(`mailto:${env.supportEmail}?subject=${encodeURIComponent("apnabanda help")}`);

  return (
    <Screen>
      <ScreenHeader title="Help & support" onBack={() => router.back()} />
      <Text className="text-lg font-semibold text-fg">Common questions</Text>
      <View className="overflow-hidden rounded-panel border border-line bg-card">
        {FAQ.map((f, i) => (
          <View key={f.q}>
            {i > 0 ? <View className="h-px bg-line" /> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === i }} onPress={() => setOpen(open === i ? null : i)}
              className="min-h-[56px] flex-row items-center gap-3 px-4 py-3 active:bg-field">
              <Text className="flex-1 text-base font-medium text-fg">{f.q}</Text>
              {open === i ? <ChevronUp size={20} color={colors.muted} /> : <ChevronDown size={20} color={colors.muted} />}
            </Pressable>
            {open === i ? <View className="px-4 pb-4"><Body muted>{f.a}</Body></View> : null}
          </View>
        ))}
      </View>
      <Text className="text-lg font-semibold text-fg">Still need help?</Text>
      <MenuGroup>
        <MenuRow icon={Mail} label="Email support" detail={`${env.supportEmail} · we reply within 24 hours`} onPress={mail} />
        {env.supportPhone ? <MenuRow icon={Phone} label="Call support" detail={env.supportPhone} onPress={() => void Linking.openURL(`tel:${env.supportPhone}`)} /> : null}
      </MenuGroup>
    </Screen>
  );
}
