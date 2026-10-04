// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get: (name: string) => string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { otp_code } = await req.json();
    if (!/^\d{6}$/.test(otp_code ?? "")) return json({ error: "Enter the 6-digit code" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Email verification is not configured" }, 500);

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || !user.email) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: otp } = await admin.from("customer_email_otps").select("*")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (!otp) return json({ error: "No code found. Request a new one." }, 404);
    if (new Date(otp.expires_at).getTime() <= Date.now()) {
      await admin.from("customer_email_otps").delete().eq("id", otp.id);
      return json({ error: "Code expired. Request a new one." }, 410);
    }
    // The code must have been issued for the account's CURRENT email.
    if (otp.email !== user.email.trim().toLowerCase()) {
      await admin.from("customer_email_otps").delete().eq("id", otp.id);
      return json({ error: "Email changed. Request a new code." }, 409);
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      await admin.from("customer_email_otps").delete().eq("id", otp.id);
      return json({ error: "Too many wrong attempts. Request a new code." }, 429);
    }

    const ok = safeEqual(await sha256(`${user.id}:${otp_code}`), otp.code_hash);
    if (!ok) {
      await admin.from("customer_email_otps").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      return json({ error: "Invalid code", attempts_left: MAX_ATTEMPTS - otp.attempts - 1 }, 400);
    }

    const { error: upsertErr } = await admin.from("customer_email_verifications")
      .upsert({ user_id: user.id, email: otp.email, verified_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (upsertErr) throw upsertErr;
    await admin.from("customer_email_otps").delete().eq("user_id", user.id);
    return json({ success: true });
  } catch (error) {
    console.error("[verify-customer-otp]", error);
    return json({ error: "Unable to verify code" }, 500);
  }
});
