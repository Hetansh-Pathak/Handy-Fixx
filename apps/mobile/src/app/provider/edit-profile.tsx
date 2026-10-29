import { fieldErrors, isProviderIdentityLocked, providerProfileSchema, toProviderProfilePatch, type ProviderProfileInput } from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { CitySuggestions } from "@/components/CitySuggestions";
import { Text } from "@/components/text";
import { Body, Button, Card, ErrorBanner, InfoBanner, Screen, ScreenHeader, TextField, ListSkeleton } from "@/components/ui";
import { providerRowKey, useSession } from "@/features/auth/session-provider";
import { fetchServices } from "@/features/customer/catalog-api";
import { loadErrorMessage } from "@/lib/load-error";
import { AvatarEditor } from "@/features/provider/AvatarEditor";
import { ServiceAreasField } from "@/features/provider/ServiceAreasField";
import { fetchProviderProfile, providerProfileKey, saveProviderProfile } from "@/features/provider/profile-api";

const EMPTY: ProviderProfileInput = {
  fullName: "", phone: "", bio: "", experienceYears: "", city: "", serviceAreas: [], serviceIds: [],
  upiId: "", bankAccountName: "", bankAccountNumber: "", bankIfsc: "",
};

const Section = ({ title, hint, error, children }: { title: string; hint?: string; error?: string; children: ReactNode }) => (
  <Card>
    <Text className="text-lg font-semibold text-fg">{title}</Text>
    {hint ? <Text className="text-sm text-muted">{hint}</Text> : null}
    <View className="gap-3 pt-1">{children}</View>
    {error ? <Text className="text-sm text-danger">{error}</Text> : null}
  </Card>
);

export default function EditProviderProfile() {
  const { provider } = useSession();
  return provider ? <EditForm providerId={provider.id} /> : null;
}

function EditForm({ providerId }: { providerId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const profile = useQuery({ queryKey: providerProfileKey(providerId), queryFn: () => fetchProviderProfile(providerId) });
  const services = useQuery({ queryKey: ["services"], queryFn: fetchServices });

  const [values, setValues] = useState<ProviderProfileInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = useRef(false);

  const locked = isProviderIdentityLocked(profile.data?.kyc_status);

  // Fill the form once from the saved row (never overwrite what the pro is typing).
  useEffect(() => {
    if (!profile.isSuccess || filled.current || !profile.data) return;
    filled.current = true;
    const p = profile.data;
    setValues({
      fullName: p.full_name ?? "",
      phone: p.phone ?? "",
      bio: p.bio ?? "",
      experienceYears: p.experience_years ? String(p.experience_years) : "",
      city: p.city ?? "",
      serviceAreas: p.pincodes ?? [],
      serviceIds: p.service_ids ?? [],
      upiId: p.upi_id ?? "",
      bankAccountName: p.bank_account_name ?? "",
      bankAccountNumber: p.bank_account_number ?? "",
      bankIfsc: p.bank_ifsc ?? "",
    });
  }, [profile.isSuccess, profile.data]);

  const set = <K extends keyof ProviderProfileInput>(key: K) => (value: ProviderProfileInput[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const save = async () => {
    const r = providerProfileSchema.safeParse(values);
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      setError("Some details need fixing. Check the highlighted fields.");
      return;
    }
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      // Services are saved on the My services screen; leaving them out here never undoes a newer choice made there.
      const { service_ids: _services, ...patch } = toProviderProfilePatch(r.data, locked);
      await saveProviderProfile(providerId, patch);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: providerProfileKey(providerId) }),
        queryClient.invalidateQueries({ queryKey: providerRowKey(userId) }),
      ]);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  if (profile.isPending) return <Screen><ScreenHeader title="Edit profile" onBack={() => router.back()} /><ListSkeleton rows={4} /></Screen>;

  return (
    <Screen>
      <ScreenHeader title="Edit profile" onBack={() => router.back()} />
      <ErrorBanner message={error ?? (profile.isError ? "Could not load your profile." : null)} />
      {userId && profile.data ? (
        <AvatarEditor userId={userId} providerId={providerId} name={values.fullName || (profile.data.full_name ?? "")} url={profile.data.avatar_url} />
      ) : null}

      <Section title="About you" hint={locked ? "Name and mobile are checked against your ID. Contact support to change them." : undefined}>
        <TextField label="Full name" value={values.fullName} onChangeText={set("fullName")} error={errors.fullName}
          editable={!locked} autoCapitalize="words" autoComplete="name" />
        <TextField label="Mobile number" value={values.phone} onChangeText={set("phone")} error={errors.phone}
          editable={!locked} keyboardType="phone-pad" autoComplete="tel" maxLength={16} hint="Customers call you on this number." />
        <TextField label="Years of experience" value={values.experienceYears} onChangeText={set("experienceYears")} error={errors.experienceYears}
          keyboardType="number-pad" maxLength={2} />
        <TextField label="About your work" value={values.bio} onChangeText={set("bio")} error={errors.bio}
          multiline maxLength={500} placeholder="e.g. 8 years fixing ACs and fridges. Own tools." hint="Shown to customers on your profile." />
      </Section>

      <Section title="Where you work" hint="Customers in these cities and pincodes can book you." error={errors.serviceAreas}>
        <TextField label="Base city" value={values.city} onChangeText={set("city")} error={errors.city} autoCapitalize="words" placeholder="e.g. Ahmedabad" />
        <CitySuggestions query={values.city} onPick={set("city")} limit={4} />
        <ServiceAreasField areas={values.serviceAreas} onChange={set("serviceAreas")}
          onCityFound={(city) => { if (!values.city.trim()) set("city")(city); }} />
      </Section>

      <Section title="Services you offer" hint="You only get requests for the services and jobs you pick." error={errors.serviceIds}>
        {services.isError ? <Body muted>{loadErrorMessage("services", services.error)}</Body> : null}
        <Body muted>
          {values.serviceIds.map((id) => services.data?.find((s) => s.id === id)?.name).filter(Boolean).join(", ") || "None picked yet."}
        </Body>
        <Button label="Choose services and jobs" variant="secondary" onPress={() => router.push("/provider/services")} />
      </Section>

      <Section title="Payout details" hint="Where HandyFix sends your wallet withdrawals. Fill UPI, bank, or both.">
        <TextField label="UPI ID" value={values.upiId} onChangeText={set("upiId")} error={errors.upiId}
          autoCapitalize="none" autoCorrect={false} placeholder="name@bank" />
        <TextField label="Account holder name" value={values.bankAccountName} onChangeText={set("bankAccountName")} error={errors.bankAccountName} autoCapitalize="words" />
        <TextField label="Account number" value={values.bankAccountNumber} onChangeText={set("bankAccountNumber")} error={errors.bankAccountNumber}
          keyboardType="number-pad" maxLength={22} />
        <TextField label="IFSC" value={values.bankIfsc} onChangeText={set("bankIfsc")} error={errors.bankIfsc}
          autoCapitalize="characters" autoCorrect={false} maxLength={11} placeholder="SBIN0001234" />
      </Section>

      <InfoBanner message={values.serviceAreas.length && values.serviceIds.length ? null : "Add at least one area and one service so customers can find you."} />
      <Button label="Save profile" loading={busy} disabled={profile.isError} onPress={() => void save()} />
    </Screen>
  );
}
