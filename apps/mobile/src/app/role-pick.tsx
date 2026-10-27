import { providerPickSchema } from "@handyfix/shared";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { chooseCustomerRole, chooseProviderRole } from "@/features/auth/api";
import { useSession } from "@/features/auth/session-provider";
import { Body, Button, ErrorBanner, InfoBanner, Screen, TextField, TextLink, Title } from "@/components/ui";
import { useZodForm } from "@/lib/use-form";

type Choice = "customer" | "provider";

/** Runs once after sign-up. One role per account, so this choice is not meant to be changed later. */
export default function RolePick() {
  const { userId, email, fullName, roleResolution, refresh, signOut } = useSession();
  const [choice, setChoice] = useState<Choice | null>(
    roleResolution && roleResolution.role === null && roleResolution.reason === "incomplete_provider" ? "provider" : null,
  );
  const form = useZodForm(providerPickSchema, { phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!choice || !userId) return;
    setError(null);
    if (choice === "provider") {
      const data = form.validate();
      if (!data) return;
      setBusy(true);
      try {
        await chooseProviderRole({ userId, fullName: fullName ?? email?.split("@")[0] ?? "Pro", email, phone: data.phone });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not set up your pro account.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await chooseCustomerRole();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your choice.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>How will you use HandyFix?</Title>
      <Body muted>Pick one. An account is either a customer or a pro, so use a different email if you ever need both.</Body>
      <InfoBanner message={roleResolution && roleResolution.role === null && roleResolution.reason === "incomplete_provider" ? "Let's finish setting up your pro account." : null} />
      <ErrorBanner message={error} />
      <RoleCard selected={choice === "customer"} title="I need a service" note="Book verified pros for repairs, cleaning and more." onPress={() => setChoice("customer")} />
      <RoleCard selected={choice === "provider"} title="I'm a pro" note="Get job requests, pay a small flat fee only when you earn. Identity verification required." onPress={() => setChoice("provider")} />
      {choice === "provider" ? (
        <TextField label="Mobile number" value={form.values.phone} onChangeText={form.set("phone")} error={form.errors.phone}
          hint="Customers can call you only after you accept a job." keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={16} />
      ) : null}
      <Button label="Continue" disabled={!choice} loading={busy} onPress={() => void confirm()} />
      <TextLink label="Sign out" onPress={() => void signOut()} />
    </Screen>
  );
}

function RoleCard({ selected, title, note, onPress }: { selected: boolean; title: string; note: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress}
      className={`gap-1 rounded-2xl border-2 p-4 ${selected ? "border-gold bg-gold/10" : "border-line bg-surface"}`}>
      <Text className="text-lg font-semibold text-white">{title}</Text>
      <Text className="text-sm text-muted">{note}</Text>
    </Pressable>
  );
}
