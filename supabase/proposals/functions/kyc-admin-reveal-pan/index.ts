// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRevealHandler } from "./handler.ts";

// PROPOSAL 20261125000001 (finding H3), NOT DEPLOYED. Rules live in handler.ts (tested in supabase/tests/security).
// Secrets: the KYC_PAN_* secrets (see _shared/pan-crypto.ts). Deploy: supabase functions deploy kyc-admin-reveal-pan

declare const Deno: { env: { get: (name: string) => string | undefined } };

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

serve(createRevealHandler({
  env: (name) => Deno.env.get(name),
  getUserId: async (authorization) => {
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data } = await authClient.auth.getUser();
    return data?.user?.id ?? null;
  },
  isAdmin: async (userId) => {
    const { data, error } = await admin.rpc("has_role", { p_user_id: userId, p_role: "admin" });
    if (error) throw error;
    return data === true;
  },
  rateTake: async (scope, keys, windowSeconds, max) => {
    const { data, error } = await admin.rpc("otp_rate_take", { p_scope: scope, p_keys: keys, p_window_seconds: windowSeconds, p_max: max });
    if (error) throw error;
    return Number(data ?? 0);
  },
  loadSealed: async (providerId) => {
    const { data, error } = await admin.from("provider_kyc").select("pan_encrypted, pan_nonce, pan_key_version").eq("provider_id", providerId).maybeSingle();
    if (error) throw error;
    if (!data?.pan_encrypted) return null;
    return { ciphertext: data.pan_encrypted as string, nonce: data.pan_nonce as string, version: Number(data.pan_key_version) };
  },
  logView: async (adminId, providerId, reason) => {
    const { error } = await admin.from("kyc_access_log").insert({ actor_id: adminId, provider_id: providerId, action: "view_pan", detail: reason });
    if (error) throw error;
  },
}));
