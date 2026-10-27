import {
  callEdge, canBecomeProvider, friendlyAuthError, parseAuthLink, PROVIDER_BLOCKED_MESSAGE, ROLE_METADATA_KEY,
  type CustomerProfile,
} from "@handyfix/shared";
import * as Linking from "expo-linking";
import { getSupabase } from "@/lib/supabase";

/** Runs a Supabase call and rethrows failures as readable messages. */
async function unwrap<R extends { data: unknown; error: { message: string } | null }>(run: () => Promise<R>): Promise<R["data"]> {
  const { data, error } = await run();
  if (error) throw new Error(friendlyAuthError(error.message));
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  await unwrap(() => getSupabase().auth.signInWithPassword({ email, password }));
}

/**
 * Email confirmation is OFF in this Supabase project, so sign-up returns a session straight away.
 * If it is ever turned on there is no session yet and `needsConfirmation` is true.
 */
export async function signUpWithEmail(input: { fullName: string; email: string; password: string }) {
  const supabase = getSupabase();
  const data = await unwrap(() =>
    supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName, display_name: input.fullName } },
    }),
  );
  if (data.session) {
    // Best effort, never blocks sign-up.
    void supabase.functions.invoke("send-welcome-email", { body: { email: input.email, display_name: input.fullName } }).catch(() => undefined);
  }
  return { needsConfirmation: !data.session };
}

export async function sendPasswordReset(email: string) {
  await unwrap(() => getSupabase().auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL("reset-password") }));
}

/** Turns the emailed recovery link into a session so the user can set a new password. */
export async function applyRecoveryLink(url: string) {
  const params = parseAuthLink(url);
  const supabase = getSupabase();
  if (params.error) throw new Error(friendlyAuthError(params.error));
  if (params.accessToken && params.refreshToken) {
    await unwrap(() => supabase.auth.setSession({ access_token: params.accessToken!, refresh_token: params.refreshToken! }));
  } else if (params.code) {
    await unwrap(() => supabase.auth.exchangeCodeForSession(params.code!));
  } else {
    throw new Error("This link is not valid. Request a new one.");
  }
}

export async function updatePassword(password: string) {
  await unwrap(() => getSupabase().auth.updateUser({ password }));
}

// ── Role pick (one role per account) ─────────────────────────────────────────

export async function chooseCustomerRole() {
  await unwrap(() => getSupabase().auth.updateUser({ data: { [ROLE_METADATA_KEY]: "customer" } }));
}

export async function chooseProviderRole(input: { userId: string; fullName: string; email: string | null; phone: string }) {
  const supabase = getSupabase();

  const { count, error: countError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", input.userId);
  if (countError) throw new Error(friendlyAuthError(countError.message));
  if (!canBecomeProvider({ customerBookingCount: count ?? 0 }).ok) throw new Error(PROVIDER_BLOCKED_MESSAGE);

  // The provider row is the authoritative fact; create it first so an interrupted flow still resolves to provider.
  const { error: insertError } = await supabase.from("service_providers").insert({
    user_id: input.userId,
    full_name: input.fullName,
    phone: input.phone,
    email: input.email,
    status: "pending_approval", // stays pending until KYC is approved
    kyc_status: "not_submitted",
  });
  // 23505 = a row already exists (retry after a half-finished attempt): fine.
  if (insertError && insertError.code !== "23505") throw new Error(friendlyAuthError(insertError.message));

  await unwrap(() => supabase.auth.updateUser({ data: { [ROLE_METADATA_KEY]: "provider" } }));
}

// ── Customer profile ─────────────────────────────────────────────────────────

export type CustomerProfileRow = {
  full_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
};

export async function loadCustomerProfile(userId: string): Promise<CustomerProfileRow | null> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("full_name, phone, address, city, pincode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(friendlyAuthError(error.message));
  return (data as CustomerProfileRow | null) ?? null;
}

export async function saveCustomerProfile(userId: string, profile: CustomerProfile) {
  const supabase = getSupabase();
  const fields = {
    full_name: profile.fullName,
    phone: profile.phone,
    address: profile.address,
    city: profile.city,
    pincode: profile.pincode,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("profiles").update(fields).eq("user_id", userId).select("user_id");
  if (error) throw new Error(friendlyAuthError(error.message));
  if (data && data.length > 0) return;
  // No row yet (older accounts, or the signup trigger did not create one): create it.
  const { error: insertError } = await supabase.from("profiles").insert({ user_id: userId, ...fields });
  if (insertError) throw new Error(friendlyAuthError(insertError.message));
}

// ── Customer email verification (OTP) ────────────────────────────────────────

/** Server-side verdict, the same function the booking RLS rule uses. */
export async function loadEmailVerified(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("is_customer_email_verified");
  return error ? false : Boolean(data);
}

export const sendEmailCode = () =>
  callEdge<{ success: boolean; email_hint?: string }>(getSupabase(), "send-customer-otp", {});

export const verifyEmailCode = (code: string) =>
  callEdge<{ success: boolean }>(getSupabase(), "verify-customer-otp", { otp_code: code });
