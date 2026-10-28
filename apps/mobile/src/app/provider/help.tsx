import { FEE_SLAB_TABLE, formatInr, LAUNCH_PERIOD } from "@handyfix/shared";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp, Mail } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { MenuGroup, MenuRow } from "@/components/menu";
import { Text } from "@/components/text";
import { Body, Screen, ScreenHeader } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { env } from "@/lib/env";
import { colors } from "@/theme/colors";

const slabs = FEE_SLAB_TABLE.map((s) => `${formatInr(s.fee)} for ${s.label.toLowerCase()}`).join(", ");

// Answers follow the business model (flat fee on completed jobs only, prepaid wallet, customer pays the pro).
const FAQ = [
  { q: "What does HandyFix charge?", a: `A flat fee on completed jobs only, taken from your wallet: ${slabs}. It is based on the service bill; parts are not counted.` },
  { q: "Is there a free period?", a: `Yes. Your first ${LAUNCH_PERIOD.months} months or first ${LAUNCH_PERIOD.jobs} jobs after approval are fee-free, whichever ends first.` },
  { q: "Does declining cost me anything?", a: "No. Declining or missing a request costs ₹0. The customer is offered the next best pros." },
  { q: "How do customers pay me?", a: "Directly, by UPI or cash, after the job. The price is locked at booking and only grows if the customer approves extra work." },
  { q: "Why am I not getting requests?", a: "You must be approved, online, and have the app open. Check that your work areas and services are filled in. Closing the app hides you from customers." },
  { q: "How do I finish a job?", a: "Ask the customer for the 4-digit completion code shown in their app and enter it on the job screen." },
  { q: "How do I top up or withdraw?", a: "Top up from the Wallet tab. To withdraw, your identity check must be approved and your UPI or bank details saved in your profile." },
  { q: "What is the identity check?", a: "HandyFix checks your ID before you can go online. Your name and mobile are matched against it, so contact support to change them after you submit." },
  { q: "What if a customer complains?", a: "Customers can raise a problem within 24 hours of a job (48 hours for repair quality). HandyFix reviews it and decides within 48 hours." },
];

export default function ProviderHelp() {
  const router = useRouter();
  const { provider } = useSession();
  const [open, setOpen] = useState<number | null>(provider?.kyc_status === "approved" ? 0 : FAQ.length - 2);
  const mail = () => void Linking.openURL(`mailto:${env.supportEmail}?subject=${encodeURIComponent("HandyFix Pro help")}`);

  return (
    <Screen>
      <ScreenHeader title="Help & support" onBack={() => router.back()} />
      <Text className="text-lg font-semibold text-fg">Common questions</Text>
      <View className="overflow-hidden rounded-3xl border border-line bg-card">
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
      </MenuGroup>
    </Screen>
  );
}
