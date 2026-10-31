import { providerPickSchema, rolesForVariant } from "@handyfix/shared";
import { useEffect, useRef, useState } from "react";
import { Pressable } from "react-native";
import { Text } from "@/components/text";
import { AuthShell } from "@/components/brand";
import { chooseCustomerRole, chooseProviderRole } from "@/features/auth/api";
import { useSession } from "@/features/auth/session-provider";
import { Body, Button, ErrorBanner, InfoBanner, TextField, TextLink, Title } from "@/components/ui";
import { env } from "@/lib/env";
import { useZodForm } from "@/lib/use-form";

type Choice = "customer" | "provider";

/** Runs once after sign-up. One role per account, so this choice is not meant to be changed later. */
export default function RolePick() {
  const { userId, email, fullName, roleResolution, refresh, signOut } = useSession();
  const offered = rolesForVariant(env.appVariant);
  const single = offered.length === 1 ? offered[0] : null; // the store apps each serve one role
  const [choice, setChoice] = useState<Choice | null>(
    single ?? (roleResolution && roleResolution.role === null && roleResolution.reason === "incomplete_provider" ? "provider" : null),
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

  // The customer app has nothing to ask: everyone who signs up there is a customer.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (single === "customer" && userId && !autoStarted.current) {
      autoStarted.current = true;
      void confirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single, userId]);

  if (single === "customer") {
    return (
      <AuthShell>
        <Title>Setting up your account…</Title>
        <ErrorBanner message={error} />
        {error ? <Button label="Try again" onPress={() => void confirm()} /> : null}
        {error ? <TextLink label="Sign out" onPress={() => void signOut()} /> : null}
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Title>{single === "provider" ? "Set up your pro account" : "How will you use apnabanda?"}</Title>
      {single ? <Body muted>Pros receive job requests and pay a small flat fee only when a job completes. Identity verification is required.</Body>
        : <Body muted>Pick one. An account is either a customer or a pro, so use a different email if you ever need both.</Body>}
      <InfoBanner message={roleResolution && roleResolution.role === null && roleResolution.reason === "incomplete_provider" ? "Let's finish setting up your pro account." : null} />
      <ErrorBanner message={error} />
      {single ? null : <RoleCard selected={choice === "customer"} title="I need a service" note="Book verified pros for repairs, cleaning and more." onPress={() => setChoice("customer")} />}
      {single ? null : <RoleCard selected={choice === "provider"} title="I'm a pro" note="Get job requests, pay a small flat fee only when you earn. Identity verification required." onPress={() => setChoice("provider")} />}
      {choice === "provider" ? (
        <TextField label="Mobile number" value={form.values.phone} onChangeText={form.set("phone")} error={form.errors.phone}
          hint="Customers can call you only after you accept a job." keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={16} />
      ) : null}
      <Button label="Continue" disabled={!choice} loading={busy} onPress={() => void confirm()} />
      <TextLink label="Sign out" onPress={() => void signOut()} />
    </AuthShell>
  );
}

function RoleCard({ selected, title, note, onPress }: { selected: boolean; title: string; note: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" aria-checked={selected} accessibilityState={{ checked: selected, selected }} onPress={onPress}
      className={`gap-1 rounded-tile border-2 p-4 ${selected ? "border-brand bg-brand/10" : "border-line bg-card"}`}>
      <Text className="text-lg font-semibold text-fg">{title}</Text>
      <Text className="text-sm text-muted">{note}</Text>
    </Pressable>
  );
}
