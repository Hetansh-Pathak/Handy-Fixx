// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createVerifyHandler, type AttemptRow } from "./handler.ts";

// PROPOSAL 20261125 (finding C3), NOT DEPLOYED. Rules live in handler.ts (tested in supabase/tests/security).
// Secret: OTP_HMAC_KEY (the same value as send-provider-otp). Needs proposal 20261125000000 applied first.
// Deploy: supabase functions deploy verify-provider-otp   (JWT check stays ON). Then delete the stray copy
// `quick-function` in the dashboard (it is the old plain-text verifier).

declare const Deno: { env: { get: (name: string) => string | undefined } };

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

const NO_ROW: AttemptRow = { status: "none", otp_id: null, code_hash: null, salt: null, email: null, attempts_left: 0 };

serve(createVerifyHandler({
  env: (name) => Deno.env.get(name),
  getUserId: async (authorization) => {
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data } = await authClient.auth.getUser();
    return data?.user?.id ?? null;
  },
  ownsProvider: async (userId, providerId) => {
    const { data } = await admin.from("service_providers").select("id").eq("id", providerId).eq("user_id", userId).maybeSingle();
    return !!data;
  },
  rateTake: async (scope, keys, windowSeconds, max) => {
    const { data, error } = await admin.rpc("otp_rate_take", { p_scope: scope, p_keys: keys, p_window_seconds: windowSeconds, p_max: max });
    if (error) throw error;
    return Number(data ?? 0);
  },
  takeAttempt: async (providerId, maxAttempts) => {
    const { data, error } = await admin.rpc("provider_otp_take_attempt", { p_provider_id: providerId, p_max_attempts: maxAttempts });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as AttemptRow | undefined;
    return row ?? NO_ROW;
  },
  consume: async (otpId) => {
    const { data, error } = await admin.rpc("provider_otp_consume", { p_otp_id: otpId });
    if (error) throw error;
    return data === true;
  },
  markVerified: async (providerId, email) => {
    const { data, error } = await admin.from("service_providers")
      .update({ is_email_verified: true, verified_at: new Date().toISOString() })
      .eq("id", providerId).eq("email", email).select("id");
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  },
}));
