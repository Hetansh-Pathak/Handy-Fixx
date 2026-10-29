import { isLegalDocKey, legalDoc, type LegalContext, type LegalDocKey } from "@handyfix/shared";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "@/components/text";
import { Body, Card, Screen, ScreenHeader, TextLink, Title } from "@/components/ui";
import { env } from "@/lib/env";

/** Who runs the apps, from build settings. Empty values are left out of the text (see packages/shared legal). */
export const legalContext = (): LegalContext => ({
  supportEmail: env.supportEmail,
  entityName: env.legalEntity || undefined,
  address: env.legalAddress || undefined,
  grievanceOfficer: env.grievanceOfficer || undefined,
});

/**
 * The privacy policy, terms of use or account-deletion page, shown inside the app so it is always available (also
 * before signing in and offline) and always matches this version of the app. The same text is published as web pages
 * for the store listings (npm run legal:build).
 */
export function LegalScreen({ doc }: { doc: string | undefined }) {
  const router = useRouter();
  const key: LegalDocKey | null = isLegalDocKey(doc) ? doc : null;
  const content = useMemo(() => (key ? legalDoc(key, legalContext()) : null), [key]);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!content) {
    return (
      <Screen>
        <ScreenHeader title="Not found" onBack={back} />
        <Body muted>This page does not exist.</Body>
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={content.title} onBack={back} />
      <Text className="text-xs text-muted">Version {content.version} · Updated {content.updated}</Text>
      <Body>{content.intro}</Body>
      {content.sections.map((s) => (
        <Card key={s.heading}>
          <Text accessibilityRole="header" className="text-lg font-semibold text-fg">{s.heading}</Text>
          {s.body.map((p, i) => <Text key={i} selectable className="text-sm leading-6 text-fg">{p}</Text>)}
        </Card>
      ))}
    </Screen>
  );
}

/** "By continuing you agree to the Terms of Use and the Privacy Policy", with both opening in the app. */
export function LegalAgreementLinks() {
  const router = useRouter();
  const open = (doc: LegalDocKey) => router.push({ pathname: "/legal/[doc]", params: { doc } });
  return (
    <View className="items-center gap-1">
      <Text className="text-center text-xs text-muted">By creating an account you agree to our</Text>
      <View className="flex-row flex-wrap items-center justify-center gap-x-1">
        <TextLink label="Terms of Use" onPress={() => open("terms")} />
        <Text className="text-xs text-muted">and</Text>
        <TextLink label="Privacy Policy" onPress={() => open("privacy")} />
      </View>
    </View>
  );
}
