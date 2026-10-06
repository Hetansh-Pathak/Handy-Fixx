// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, makeJson } from "../_shared/cors.ts";

declare const Deno: { env: { get: (name: string) => string | undefined } };

const MAX_ATTEMPTS = 5;

const sha256 = async (value: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const json = makeJson(corsHeaders);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { provider_id, otp_code } = await req.json();
    if (!provider_id || !/^\d{6}$/.test(otp_code ?? "")) return json({ error: "Enter the 6-digit code" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceRoleKey) return json({ error: "Email verification is not configured" }, 500);

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceRoleKey);
    const { data: provider } = await admin.from("service_providers").select("id, email")
      .eq("id", provider_id).eq("user_id", user.id).maybeSingle();
    if (!provider) return json({ error: "Provider not found" }, 403);

    const { data: otp } = await admin.from("provider_otp_codes")
      .select("id, email, code_hash, attempts, expires_at")
      .eq("provider_id", provider_id).eq("verified", false)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!otp) return json({ error: "No verification code found. Request a new one." }, 404);

    if (new Date(otp.expires_at).getTime() <= Date.now()) {
      await admin.from("provider_otp_codes").delete().eq("id", otp.id);
      return json({ error: "Code expired — request a new one" }, 410);
    }
    // The code must have been issued for the provider's CURRENT email.
    if (!provider.email || otp.email !== provider.email.trim().toLowerCase()) {
      await admin.from("provider_otp_codes").delete().eq("id", otp.id);
      return json({ error: "Email changed. Request a new code." }, 409);
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      await admin.from("provider_otp_codes").delete().eq("id", otp.id);
      return json({ error: "Too many wrong attempts. Request a new code." }, 429);
    }

    const ok = safeEqual(await sha256(`${provider_id}:${otp_code}`), otp.code_hash);
    if (!ok) {
      await admin.from("provider_otp_codes").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      return json({ error: "Invalid code", attempts_left: MAX_ATTEMPTS - otp.attempts - 1 }, 400);
    }

    const { error: providerError } = await admin.from("service_providers")
      .update({ is_email_verified: true, verified_at: new Date().toISOString() }).eq("id", provider_id);
    if (providerError) throw providerError;
    await admin.from("provider_otp_codes").delete().eq("provider_id", provider_id);
    return json({ success: true });
  } catch (error) {
    console.error("[verify-provider-otp]", error);
    return json({ error: "Unable to verify code" }, 500);
  }
});
