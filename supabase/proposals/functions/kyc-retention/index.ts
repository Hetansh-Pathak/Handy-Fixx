// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRetentionHandler } from "./handler.ts";

// PROPOSAL 20261125000001 (finding H3), NOT DEPLOYED. Rules live in handler.ts (tested in supabase/tests/security).
// Secret: KYC_RETENTION_SECRET (at least 32 characters; the same value goes into the vault as kyc_retention_secret).
// Deploy: supabase functions deploy kyc-retention --no-verify-jwt   (pg_cron sends no login; the secret header guards it)

declare const Deno: { env: { get: (name: string) => string | undefined } };

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

serve(createRetentionHandler({
  env: (name) => Deno.env.get(name),
  due: async (limit) => {
    const { data, error } = await admin.rpc("kyc_retention_due", { p_limit: limit });
    if (error) throw error;
    return (data ?? []) as { provider_id: string; paths: string[] }[];
  },
  removeFiles: async (paths) => {
    const { error } = await admin.storage.from("provider-kyc").remove(paths);
    if (error) console.error("[kyc-retention] storage", error.message);
    return !error;
  },
  markDone: async (providerId, paths) => {
    const { data, error } = await admin.rpc("kyc_retention_mark_done", { p_provider_id: providerId, p_paths: paths });
    if (error) throw error;
    return Number(data ?? 0);
  },
}));
