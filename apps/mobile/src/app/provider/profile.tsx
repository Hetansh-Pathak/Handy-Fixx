import { Text, View } from "react-native";
import { Body, Button, Card, Screen, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <View className="flex-row justify-between gap-4">
    <Text className="text-base text-muted">{label}</Text>
    <Text className="flex-1 text-right text-base text-white">{value || "Not set"}</Text>
  </View>
);

export default function ProviderProfile() {
  const { provider, email, signOut } = useSession();
  return (
    <Screen>
      <Title>Profile</Title>
      <Card>
        <Row label="Name" value={provider?.full_name} />
        <Row label="Mobile" value={provider?.phone} />
        <Row label="Email" value={provider?.email ?? email} />
        <Row label="Account" value={provider?.status?.replace(/_/g, " ")} />
        <Row label="Identity check" value={provider?.kyc_status?.replace(/_/g, " ")} />
      </Card>
      <Body muted>Editing your pro profile, services and areas arrives with the identity wizard in slice 5.</Body>
      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
