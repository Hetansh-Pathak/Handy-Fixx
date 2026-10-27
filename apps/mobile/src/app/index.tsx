import { Link } from "expo-router";
import { Text } from "react-native";
import { Body, Card, Screen, Title } from "@/components/ui";
import { env } from "@/lib/env";

export default function Home() {
  return (
    <Screen>
      <Text className="text-sm font-semibold uppercase tracking-widest text-gold">HandyFix</Text>
      <Title>Native checks</Title>
      <Body muted>
        The app shell is ready: Expo Router, NativeWind and @handyfix/shared. Real screens arrive slice by slice
        (auth first). Until then, use the checks below on a real Android phone.
      </Body>
      {env.spikeEnabled ? (
        <Link href="/spike" asChild>
          <Card>
            <Text className="text-lg font-semibold text-white">Open native checks</Text>
            <Text className="text-sm text-muted">Background location, request alert, push, Google sign-in</Text>
          </Card>
        </Link>
      ) : (
        <Body muted>Native checks are disabled in this build.</Body>
      )}
    </Screen>
  );
}
