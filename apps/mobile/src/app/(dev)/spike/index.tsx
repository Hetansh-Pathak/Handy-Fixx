import { Link, type Href } from "expo-router";
import { Text } from "react-native";
import { Body, Card, Screen, Title } from "@/components/ui";

const CHECKS: { href: Href; title: string; note: string }[] = [
  { href: "/spike/location", title: "1. Background location", note: "Provider sharing position while the phone is locked" },
  { href: "/spike/request-alert", title: "2. New-request alert", note: "In-app full screen + background notification with sound" },
  { href: "/spike/push", title: "3. Push notifications (FCM)", note: "Permission, device token, receive and tap" },
  { href: "/spike/google", title: "4. Native Google sign-in", note: "Google account → Supabase session" },
];

export default function SpikeMenu() {
  return (
    <Screen>
      <Title>Native checks</Title>
      <Body muted>Run each on a real Android phone using a development build. Note pass or fail in SPIKE.md.</Body>
      {CHECKS.map((c) => (
        <Link key={c.title} href={c.href} asChild>
          <Card>
            <Text className="text-lg font-semibold text-white">{c.title}</Text>
            <Text className="text-sm text-muted">{c.note}</Text>
          </Card>
        </Link>
      ))}
    </Screen>
  );
}
