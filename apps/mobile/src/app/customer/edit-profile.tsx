import { customerProfileSchema } from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { CitySuggestions } from "@/components/CitySuggestions";
import { Button, ErrorBanner, Screen, ScreenHeader, TextField } from "@/components/ui";
import { loadCustomerProfile, saveCustomerProfile } from "@/features/auth/api";
import { useSession } from "@/features/auth/session-provider";
import { useZodForm } from "@/lib/use-form";

/** A screen can still be mounted for one render while signing out, so never assume a user here. */
export default function EditCustomerProfile() {
  const { userId } = useSession();
  return userId ? <ProfileForm userId={userId} /> : null;
}

function ProfileForm({ userId }: { userId: string }) {
  const router = useRouter();
  const { fullName } = useSession();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["customer-profile", userId], queryFn: () => loadCustomerProfile(userId) });
  const form = useZodForm(customerProfileSchema, { fullName: fullName ?? "", phone: "", address: "", city: "", pincode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = useRef(false);

  // Fill the form once from the saved profile (never overwrite what the user is typing).
  useEffect(() => {
    if (!profile.isSuccess || filled.current) return;
    filled.current = true;
    const p = profile.data;
    form.setValues({
      fullName: p?.full_name ?? fullName ?? "",
      phone: p?.phone ?? "",
      address: p?.address ?? "",
      city: p?.city ?? "",
      pincode: p?.pincode ?? "",
    });
  }, [profile.isSuccess, profile.data, fullName, form]);

  const save = async () => {
    const data = form.validate();
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await saveCustomerProfile(userId, data);
      await queryClient.invalidateQueries({ queryKey: ["customer-profile", userId] });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Edit profile" onBack={() => router.back()} />
      <ErrorBanner message={error ?? (profile.isError ? "Could not load your profile." : null)} />
      <TextField label="Full name" value={form.values.fullName} onChangeText={form.set("fullName")} error={form.errors.fullName} autoCapitalize="words" autoComplete="name" />
      <TextField label="Mobile number" value={form.values.phone} onChangeText={form.set("phone")} error={form.errors.phone}
        hint="Shared with your pro only after they accept." keyboardType="phone-pad" autoComplete="tel" maxLength={16} />
      <TextField label="Address" value={form.values.address} onChangeText={form.set("address")} error={form.errors.address}
        hint="Filled in for you when you book." autoComplete="street-address" multiline />
      <TextField label="City" value={form.values.city} onChangeText={form.set("city")} error={form.errors.city} autoCapitalize="words" />
      <CitySuggestions query={form.values.city} onPick={form.set("city")} />
      <TextField label="Pincode" value={form.values.pincode} onChangeText={form.set("pincode")} error={form.errors.pincode} keyboardType="number-pad" maxLength={6} autoComplete="postal-code" />
      <Button label="Save changes" loading={busy} disabled={profile.isPending} onPress={() => void save()} />
    </Screen>
  );
}
