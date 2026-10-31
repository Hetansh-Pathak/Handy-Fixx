import { DELETE_CONFIRM_WORD, deletionBlockers, deletionErrorMessage, isDeleteConfirmed } from "@handyfix/shared";
import { useRouter } from "expo-router";
import { TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { Linking, View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, ErrorBanner, Screen, ScreenHeader, TextField, TextLink } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { env } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";
import { useThemeColors } from "@/theme/theme";

/** Reads the readable reason the function sent back, if any. */
async function reasonFrom(error: unknown): Promise<string | undefined> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try { const body = (await ctx.json()) as { error?: string }; return body.error; } catch { /* not JSON */ }
  }
  return error instanceof Error ? error.message : undefined;
}

/**
 * Store requirement: people can delete their account from inside the app. The work happens in the `delete-account`
 * edge function (a proposal until the owner approves it). Until it is live, the screen says so and offers an email.
 */
export function DeleteAccountScreen({ role, activeBookings, walletBalance, walletDue }: {
  role: "customer" | "provider"; activeBookings: number; walletBalance?: number; walletDue?: number;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const { signOut, email } = useSession();
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockers = deletionBlockers({ role, activeBookings, walletBalance, walletDue });
  const mail = () => void Linking.openURL(
    `mailto:${env.supportEmail}?subject=${encodeURIComponent("Delete my apnabanda account")}&body=${encodeURIComponent(`Please delete my apnabanda account (${email ?? "my email"}).`)}`,
  );

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: fnError } = await getSupabase().functions.invoke("delete-account", { body: {} });
      if (fnError) throw fnError;
      await signOut();
    } catch (e) {
      setError(deletionErrorMessage(await reasonFrom(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Delete account" onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <View className="flex-row items-start gap-3 rounded-tile border border-danger bg-danger/10 p-4">
        <TriangleAlert size={22} color={colors.danger} />
        <Text className="flex-1 text-base text-danger">This cannot be undone. Your profile, saved address and documents are removed.</Text>
      </View>
      <Card>
        <Text className="text-base font-semibold text-fg">What happens</Text>
        <Body muted>Your name, phone number, address, photos and {role === "provider" ? "identity documents and payout details " : ""}are erased.</Body>
        <Body muted>Records of finished jobs and payments are kept without your name, because the law and any open disputes need them.</Body>
        <Body muted>You are signed out on every phone.</Body>
      </Card>

      {blockers.length ? (
        <Card>
          <Text className="text-base font-semibold text-fg">Before you can delete</Text>
          {blockers.map((b) => <Text key={b} className="text-sm text-danger">• {b}</Text>)}
        </Card>
      ) : (
        <>
          <TextField label={`Type ${DELETE_CONFIRM_WORD} to confirm`} value={word} onChangeText={setWord} autoCapitalize="characters" autoCorrect={false} />
          <ErrorBanner message={error} />
          <Button label="Delete my account" variant="danger" loading={busy} disabled={!isDeleteConfirmed(word)} onPress={() => void remove()} />
        </>
      )}
      <TextLink label="Email support to delete it for me" onPress={mail} />
    </Screen>
  );
}
