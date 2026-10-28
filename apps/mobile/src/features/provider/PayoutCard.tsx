import { fieldErrors, payoutDetailsSchema, payoutSummary, toPayoutPatch, type PayoutDetailsInput } from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Smartphone } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, ErrorBanner, TextField } from "@/components/ui";
import { useThemeColors } from "@/theme/theme";
import { fetchProviderProfile, providerProfileKey, savePayoutDetails } from "./profile-api";

const EMPTY: PayoutDetailsInput = { upiId: "", bankAccountName: "", bankAccountNumber: "", bankIfsc: "" };

/** Where withdrawals are sent. Shown on the wallet; saving never touches the rest of the profile. */
export function PayoutCard({ providerId }: { providerId: string }) {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: providerProfileKey(providerId), queryFn: () => fetchProviderProfile(providerId) });
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<PayoutDetailsInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = profile.data ? payoutSummary(profile.data) : null;

  const open = () => {
    const p = profile.data;
    setValues({
      upiId: p?.upi_id ?? "",
      bankAccountName: p?.bank_account_name ?? "",
      bankAccountNumber: p?.bank_account_number ?? "",
      bankIfsc: p?.bank_ifsc ?? "",
    });
    setErrors({});
    setError(null);
    setEditing(true);
  };

  const set = (key: keyof PayoutDetailsInput) => (value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const save = async () => {
    const r = payoutDetailsSchema.safeParse(values);
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await savePayoutDetails(providerId, toPayoutPatch(r.data));
      await queryClient.invalidateQueries({ queryKey: providerProfileKey(providerId) });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your payout details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text className="text-lg font-semibold text-fg">Payout details</Text>
      {profile.isPending ? <Body muted>Loading…</Body> : null}
      {profile.isError ? (
        <>
          <ErrorBanner message="Could not load your payout details." />
          <Button label="Try again" variant="secondary" onPress={() => void profile.refetch()} />
        </>
      ) : null}

      {saved && !editing ? (
        <>
          {saved.ready ? (
            <View className="gap-2">
              {saved.upi ? <Detail icon="upi" label="UPI" value={saved.upi} /> : null}
              {saved.bank ? <Detail icon="bank" label="Bank" value={saved.bank} /> : null}
            </View>
          ) : <Body muted>Add a UPI ID or your bank account so we know where to send your withdrawals.</Body>}
          <Button label={saved.ready ? "Change payout details" : "Add payout details"} variant={saved.ready ? "secondary" : "primary"} onPress={open} />
        </>
      ) : null}

      {editing ? (
        <View className="gap-3">
          <TextField label="UPI ID" value={values.upiId} onChangeText={set("upiId")} error={errors.upiId}
            autoCapitalize="none" autoCorrect={false} placeholder="name@bank" hint="Fastest. Fill UPI, a bank account, or both." />
          <Text className="text-sm font-medium text-fg">Bank account (optional)</Text>
          <TextField label="Account holder name" value={values.bankAccountName} onChangeText={set("bankAccountName")} error={errors.bankAccountName} autoCapitalize="words" />
          <TextField label="Account number" value={values.bankAccountNumber} onChangeText={(t) => set("bankAccountNumber")(t.replace(/[^\d\s]/g, ""))}
            error={errors.bankAccountNumber} keyboardType="number-pad" maxLength={22} />
          <TextField label="IFSC" value={values.bankIfsc} onChangeText={(t) => set("bankIfsc")(t.toUpperCase())} error={errors.bankIfsc}
            autoCapitalize="characters" autoCorrect={false} maxLength={11} placeholder="SBIN0001234" />
          <ErrorBanner message={error} />
          <Button label="Save payout details" loading={busy} onPress={() => void save()} />
          <Button label="Cancel" variant="secondary" disabled={busy} onPress={() => setEditing(false)} />
        </View>
      ) : null}
    </Card>
  );
}

function Detail({ icon, label, value }: { icon: "upi" | "bank"; label: string; value: string }) {
  const colors = useThemeColors();
  const Icon = icon === "upi" ? Smartphone : Landmark;
  return (
    <View className="flex-row items-center gap-3">
      <Icon size={18} color={colors.brand} />
      <View className="flex-1">
        <Text className="text-xs uppercase tracking-wider text-muted">{label}</Text>
        <Text className="text-base text-fg">{value}</Text>
      </View>
    </View>
  );
}
