// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get: (name: string) => string | undefined } };
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { provider_id, otp_code } = await req.json();
    if (!provider_id || !/^\d{6}$/.test(otp_code ?? "")) return json({ error: "Enter the 6-digit code" }, 400);
    const url = Deno.env.get("SUPABASE_URL"), anonKey = Deno.env.get("SUPABASE_ANON_KEY"), serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceRoleKey) return json({ error: "Email verification is not configured" }, 500);
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(url, serviceRoleKey);
    const { data: provider } = await admin.from("service_providers").select("id").eq("id", provider_id).eq("user_id", user.id).maybeSingle();
    if (!provider) return json({ error: "Provider not found" }, 403);

    const { data: latest } = await admin.from("provider_otp_codes").select("id, otp_code, expires_at").eq("provider_id", provider_id).eq("verified", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!latest) return json({ error: "No verification code found. Request a new one." }, 404);
    if (new Date(latest.expires_at).getTime() <= Date.now()) return json({ error: "Code expired — request a new one" }, 410);
    if (latest.otp_code !== otp_code) return json({ error: "Invalid code" }, 400);

    const { error: otpError } = await admin.from("provider_otp_codes").update({ verified: true }).eq("id", latest.id);
    if (otpError) throw otpError;
    const { error: providerError } = await admin.from("service_providers").update({ is_email_verified: true, verified_at: new Date().toISOString() }).eq("id", provider_id);
    if (providerError) throw providerError;
    return json({ success: true });
  } catch (error) {
    console.error("[verify-provider-otp]", error);
    return json({ error: "Unable to verify code" }, 500);
  }
});
