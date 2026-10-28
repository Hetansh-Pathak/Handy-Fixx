import { FEE_RULE_LABEL, LAUNCH_PERIOD, RECHARGE_PACK_AMOUNTS, formatInr } from "@handyfix/shared";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp, FileText, Mail, Phone } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { MenuGroup, MenuRow } from "@/components/menu";
import { Text } from "@/components/text";
import { Body, Screen, ScreenHeader } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { TermsSheet } from "@/features/kyc/components";
import { env } from "@/lib/env";
import { useThemeColors } from "@/theme/theme";

const amounts = RECHARGE_PACK_AMOUNTS.map(formatInr);
const packs = `${amounts.slice(0, -1).join(", ")} or ${amounts[amounts.length - 1]}`;

// Answers follow the business model (3% fee on completed jobs only, prepaid wallet, customer pays the pro).
const FAQ = [
  { q: "What does HandyFix charge?", a: `A fee on completed jobs only: ${FEE_RULE_LABEL}. It is worked out from the service bill (parts are not counted), reserved in your wallet when you accept and taken when the job completes. Cancelled or declined jobs cost nothing.` },
  { q: "Is there a free period?", a: `Yes. Your first ${LAUNCH_PERIOD.months} months or first ${LAUNCH_PERIOD.jobs} jobs after approval are fee-free, whichever ends first.` },
  { q: "Does declining cost me anything?", a: "No. Declining or missing a request costs ₹0. The customer is offered the next best pros." },
  { q: "How do customers pay me?", a: "Directly, by UPI or cash, after the job. The price is locked at booking and only grows if the customer approves extra work." },
  { q: "Why am I not getting requests?", a: "You must be approved, online, and have the app open. Check that your work areas and services are filled in. Closing the app hides you from customers." },
  { q: "How do I finish a job?", a: "Ask the customer for the 4-digit completion code shown in their app and enter it on the job screen." },
  { q: "How do I top up or withdraw?", a: `Recharge from the Wallet tab with a ${packs} pack. To withdraw, your identity check must be approved and your UPI or bank details saved under Payout details on the Wallet tab.` },
  { q: "What is the identity check?", a: "HandyFix checks your ID before you can go online. Your name and mobile are matched against it, so contact support to change them after you submit." },
  { q: "What if a customer complains?", a: "Customers can raise a problem within 24 hours of a job (48 hours for repair quality). HandyFix reviews it and decides within 48 hours." },
];

export default function ProviderHelp() {
  const colors = useThemeColors();
  const router = useRouter();
  const { provider } = useSession();
  const [open, setOpen] = useState<number | null>(provider?.kyc_status === "approved" ? 0 : FAQ.length - 2);
  const [terms, setTerms] = useState(false);
  const mail = () => void Linking.openURL(`mailto:${env.supportEmail}?subject=${encodeURIComponent("HandyFix Pro help")}`);

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
        <MenuRow icon={FileText} label="Partner agreement" detail="The terms you accepted" onPress={() => setTerms(true)} />
      </MenuGroup>
      <TermsSheet visible={terms} onClose={() => setTerms(false)} />
    </Screen>
  );
}
