import { Body, Card, Screen, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";

export default function CustomerHome() {
  const { fullName } = useSession();
  return (
    <Screen>
      <Title>Hi{fullName ? `, ${fullName.split(" ")[0]}` : ""}</Title>
      <Body muted>What do you need fixed today?</Body>
      <Card>
        <Body>Services and verified pros arrive in the next slice.</Body>
      </Card>
    </Screen>
  );
}
