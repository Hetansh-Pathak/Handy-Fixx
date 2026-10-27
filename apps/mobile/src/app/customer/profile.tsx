import { customerProfileSchema } from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { loadCustomerProfile, saveCustomerProfile } from "@/features/auth/api";
import { EmailVerificationCard } from "@/features/auth/EmailVerificationCard";
import { useSession } from "@/features/auth/session-provider";
import { Body, Button, ErrorBanner, InfoBanner, Screen, TextField, Title } from "@/components/ui";
import { useZodForm } from "@/lib/use-form";

/** A screen can still be mounted for one render while signing out, so never assume a user here. */
export default function CustomerProfile() {
  const { userId } = useSession();
  return userId ? <ProfileForm userId={userId} /> : null;
}

function ProfileForm({ userId }: { userId: string }) {
  const { email, fullName, signOut } = useSession();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["customer-profile", userId], queryFn: () => loadCustomerProfile(userId) });
  const form = useZodForm(customerProfileSchema, { fullName: fullName ?? "", phone: "", address: "", city: "", pincode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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
    setSaved(false);
    try {
      await saveCustomerProfile(userId, data);
      await queryClient.invalidateQueries({ queryKey: ["customer-profile", userId] });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Profile</Title>
      <EmailVerificationCard userId={userId} email={email} />
      <ErrorBanner message={error ?? (profile.isError ? "Could not load your profile." : null)} />
      <InfoBanner message={saved ? "Profile saved." : null} />
      <TextField label="Full name" value={form.values.fullName} onChangeText={form.set("fullName")} error={form.errors.fullName} autoCapitalize="words" autoComplete="name" />
      <TextField label="Mobile number" value={form.values.phone} onChangeText={form.set("phone")} error={form.errors.phone}
        hint="Shared with your pro only after they accept." keyboardType="phone-pad" autoComplete="tel" maxLength={16} />
      <TextField label="Address" value={form.values.address} onChangeText={form.set("address")} error={form.errors.address} autoComplete="street-address" multiline />
      <TextField label="City" value={form.values.city} onChangeText={form.set("city")} error={form.errors.city} autoCapitalize="words" />
      <TextField label="Pincode" value={form.values.pincode} onChangeText={form.set("pincode")} error={form.errors.pincode} keyboardType="number-pad" maxLength={6} autoComplete="postal-code" />
      <Button label="Save changes" loading={busy} disabled={profile.isPending} onPress={() => void save()} />
      <Body muted>Signed in as {email}</Body>
      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
