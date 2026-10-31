import { KYC_STEP_LABELS, KYC_TOTAL_STEPS, kycStatusView, resumeKycStep } from "@handyfix/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CircleCheck, Clock, FileText, ShieldCheck, TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { IconTile } from "@/components/brand";
import { Text } from "@/components/text";
import { Body, Button, Card, Screen, ScreenHeader, Title } from "@/components/ui";
import { providerRowKey, useSession } from "@/features/auth/session-provider";
import { kycKey } from "@/features/kyc/api";
import { useKycWizard } from "@/features/kyc/wizard-context";
import { useThemeColors } from "@/theme/theme";

const NEEDS = [
  "Your PAN card",
  "A clear selfie (we will open the camera)",
  "About 10 minutes. Your answers are saved after every step.",
];

export default function KycHome() {
  const colors = useThemeColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId, provider } = useSession();
  const { record } = useKycWizard();
  const [refreshing, setRefreshing] = useState(false);
  const status = record.kycStatus;
  const view = kycStatusView(status, record.rejectionReason, record.onboardingStep);
  const home = () => router.replace("/provider");

  const recheck = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: providerRowKey(userId) }),
      queryClient.invalidateQueries({ queryKey: kycKey(provider?.id ?? "") }),
    ]);
    setRefreshing(false);
  };

  if (status === "approved") {
    return (
      <Screen>
        <ScreenHeader title="Identity check" onBack={home} />
        <View className="items-center gap-3 py-8">
          <IconTile size={72}><CircleCheck size={40} color={colors.ok} /></IconTile>
          <Title>You are verified</Title>
          <Body muted>Your identity is checked. You can go online and receive jobs.</Body>
        </View>
        <Button label="Go to home" onPress={home} />
      </Screen>
    );
  }

  if (status === "pending") {
    return (
      <Screen>
        <ScreenHeader title="Identity check" onBack={home} />
        <View className="items-center gap-3 py-8">
          <IconTile size={72}><Clock size={40} color={colors.brand} /></IconTile>
          <Title>Under review</Title>
          <Text className="text-center text-base text-muted">{view.note}</Text>
        </View>
        <Card>
          <Text className="text-base font-semibold text-fg">What happens next</Text>
          <Body muted>1. Our team checks that your name, selfie and ID match.</Body>
          <Body muted>2. You get a message here the moment it is approved, or what to fix if it is not.</Body>
          <Body muted>3. After approval you can go online and receive jobs.</Body>
        </Card>
        <Button label="Check status again" variant="secondary" loading={refreshing} onPress={() => void recheck()} />
        <Button label="Back to home" onPress={home} />
      </Screen>
    );
  }

  const step = resumeKycStep(record.onboardingStep, status);
  const rejected = status === "rejected";
  return (
    <Screen>
      <ScreenHeader title="Identity check" onBack={home} />
      <View className="items-center gap-3 py-4">
        <IconTile size={72}>{rejected ? <TriangleAlert size={36} color={colors.danger} /> : <ShieldCheck size={36} color={colors.brand} />}</IconTile>
        <Title>{view.title}</Title>
        <Text className="text-center text-base text-muted">{view.note}</Text>
      </View>

      {!rejected ? (
        <Card>
          <Text className="text-base font-semibold text-fg">Keep these ready</Text>
          {NEEDS.map((n) => (
            <View key={n} className="flex-row items-start gap-2"><FileText size={16} color={colors.brand} style={{ marginTop: 3 }} /><Text className="flex-1 text-sm text-muted">{n}</Text></View>
          ))}
        </Card>
      ) : null}

      {step > 1 ? <Text className="text-center text-sm text-muted">Next up: step {step} of {KYC_TOTAL_STEPS}, {KYC_STEP_LABELS[step]}</Text> : null}
      <Button label={view.button ?? "Start verification"} onPress={() => router.push(`/provider/kyc/${step}`)} />
      <Text className="text-center text-xs text-muted">Free. Joining and going online cost ₹0.</Text>
    </Screen>
  );
}
