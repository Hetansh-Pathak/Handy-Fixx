import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { Body, Button, Screen, ScreenHeader } from "@/components/ui";
import { KycWizardProvider } from "@/features/kyc/wizard-context";
import { useThemeColors } from "@/theme/theme";
import { useRouter } from "expo-router";

export default function KycLayout() {
  const colors = useThemeColors();
  const router = useRouter();
  const goHome = () => (router.canGoBack() ? router.back() : router.replace("/provider"));
  return (
    <KycWizardProvider
      loading={
        <Screen>
          <ScreenHeader title="Identity check" onBack={goHome} />
          <View className="items-center gap-3 py-16"><ActivityIndicator color={colors.brand} /><Body muted>Loading your application…</Body></View>
        </Screen>
      }
      failed={(message, retry) => (
        <Screen>
          <ScreenHeader title="Identity check" onBack={goHome} />
          <Body muted>{message}</Body>
          <Button label="Try again" onPress={retry} />
        </Screen>
      )}
    >
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
    </KycWizardProvider>
  );
}
