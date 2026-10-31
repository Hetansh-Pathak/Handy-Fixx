// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createKycPanHandler } from "./handler.ts";

// PROPOSAL 20261125000001 (finding H3), NOT DEPLOYED. Rules live in handler.ts (tested in supabase/tests/security).
// Secrets: KYC_PAN_KEY, KYC_PAN_KEY_VERSION (optional, default 1), KYC_PAN_HMAC_KEY (see _shared/pan-crypto.ts).
// Needs proposals 20261125000000 (otp_rate_take) and 20261125000001. Deploy: supabase functions deploy kyc-pan

declare const Deno: { env: { get: (name: string) => string | undefined } };

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

serve(createKycPanHandler({
  env: (name) => Deno.env.get(name),
  getUserId: async (authorization) => {
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data } = await authClient.auth.getUser();
    return data?.user?.id ?? null;
  },
  getProvider: async (userId) => {
    const { data } = await admin.from("service_providers").select("id, kyc_status, phone, bank_account_name").eq("user_id", userId).maybeSingle();
    return data ?? null;
  },
  rateTake: async (scope, keys, windowSeconds, max) => {
    const { data, error } = await admin.rpc("otp_rate_take", { p_scope: scope, p_keys: keys, p_window_seconds: windowSeconds, p_max: max });
    if (error) throw error;
    return Number(data ?? 0);
  },
  blocklistHit: async (pan, phone, bankName) => {
    const { data, error } = await admin.rpc("kyc_blocklist_hit", { p_pan: pan, p_phone: phone, p_bank_name: bankName });
    if (error) throw error;
    return data === true;
  },
  panHolder: async (blind) => {
    const { data } = await admin.from("provider_kyc").select("provider_id").eq("pan_blind_index", blind).maybeSingle();
    return (data?.provider_id as string | undefined) ?? null;
  },
  savePan: async (providerId, v) => {
    const { error } = await admin.from("provider_kyc").upsert({ provider_id: providerId, ...v }, { onConflict: "provider_id" });
    if (error?.code === "23505") return "duplicate";
    if (error) throw error;
    return "ok";
  },
  saveIdentifiers: async (providerId, v) => {
    const { data, error } = await admin.from("provider_kyc").update(v).eq("provider_id", providerId).select("pan_blind_index").maybeSingle();
    if (error) throw error;
    return (data?.pan_blind_index as string | undefined) ?? null;
  },
}));
