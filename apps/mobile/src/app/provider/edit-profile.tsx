import {
  addServiceArea, fieldErrors, isProviderIdentityLocked, isValidPincode, MAX_SERVICE_AREAS, normalizeServiceArea,
  providerProfileSchema, suggestCities, toProviderProfilePatch, type ProviderProfileInput,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { CitySuggestions } from "@/components/CitySuggestions";
import { Text } from "@/components/text";
import { Body, Button, Card, Chip, ErrorBanner, InfoBanner, Screen, ScreenHeader, TextField } from "@/components/ui";
import { providerRowKey, useSession } from "@/features/auth/session-provider";
import { fetchServices } from "@/features/customer/catalog-api";
import { AvatarEditor } from "@/features/provider/AvatarEditor";
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
  const [areaInput, setAreaInput] = useState("");
  const [areaError, setAreaError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
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

  const suggestions = useMemo(() => suggestCities(areaInput, values.serviceAreas), [areaInput, values.serviceAreas]);

  const addArea = (input: string) => {
    const r = addServiceArea(values.serviceAreas, input);
    if (!r.ok) return setAreaError(r.error);
    set("serviceAreas")(r.areas);
    setAreaInput("");
    setAreaError(null);
  };

  const removeArea = (area: string) => set("serviceAreas")(values.serviceAreas.filter((a) => a !== area));

  const toggleService = (id: string) =>
    set("serviceIds")(values.serviceIds.includes(id) ? values.serviceIds.filter((s) => s !== id) : [...values.serviceIds, id]);

  /** Adds the city and pincode the phone is in right now (foreground permission only). */
  const addCurrentArea = async () => {
    setLocating(true);
    setAreaError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error("Location permission was denied. You can type the city or pincode instead.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      const found = [place?.postalCode, place?.city, place?.subregion]
        .filter((v): v is string => !!v)
        .map(normalizeServiceArea)
        .filter((v): v is string => !!v);
      let areas = values.serviceAreas;
      for (const a of found) {
        const r = addServiceArea(areas, a);
        if (r.ok) areas = r.areas;
      }
      if (areas === values.serviceAreas) {
        throw new Error(found.length ? "Your current area is already in the list." : "Could not find a Gujarat city or pincode here. Type it instead.");
      }
      set("serviceAreas")(areas);
      const city = found.find((a) => !isValidPincode(a));
      if (city && !values.city.trim()) set("city")(city);
    } catch (e) {
      setAreaError(e instanceof Error ? e.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
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
      await saveProviderProfile(providerId, toProviderProfilePatch(r.data, locked));
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

  if (profile.isPending) return <Screen><ScreenHeader title="Edit profile" onBack={() => router.back()} /><Body muted>Loading…</Body></Screen>;

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
        {values.serviceAreas.length ? (
          <View className="flex-row flex-wrap gap-2">
            {values.serviceAreas.map((a) => <Chip key={a} label={`${a}  ✕`} selected onPress={() => removeArea(a)} />)}
          </View>
        ) : <Body muted>No areas yet.</Body>}
        <TextField label="Add a city or pincode" value={areaInput} onChangeText={(t) => { setAreaInput(t); setAreaError(null); }}
          error={areaError ?? undefined} autoCapitalize="words" returnKeyType="done" onSubmitEditing={() => addArea(areaInput)}
          hint={`${values.serviceAreas.length} of ${MAX_SERVICE_AREAS}. Tap an area to remove it.`} />
        {suggestions.length ? (
          <View className="flex-row flex-wrap gap-2">
            {suggestions.map((c) => <Chip key={c} label={`+ ${c}`} onPress={() => addArea(c)} />)}
          </View>
        ) : null}
        <View className="flex-row gap-2">
          <View className="flex-1"><Button label="Add" variant="secondary" disabled={!areaInput.trim()} onPress={() => addArea(areaInput)} /></View>
          <View className="flex-[2]"><Button label="Add my current area" variant="secondary" loading={locating} onPress={() => void addCurrentArea()} /></View>
        </View>
      </Section>

      <Section title="Services you offer" hint="You only get requests for the services you pick." error={errors.serviceIds}>
        {services.isError ? <Body muted>Could not load services.</Body> : null}
        <View className="flex-row flex-wrap gap-2">
          {(services.data ?? []).map((s) => (
            <Chip key={s.id} label={s.name} selected={values.serviceIds.includes(s.id)} onPress={() => toggleService(s.id)} />
          ))}
        </View>
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
