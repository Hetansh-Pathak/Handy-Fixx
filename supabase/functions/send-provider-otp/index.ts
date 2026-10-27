// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get: (name: string) => string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const otpEmail = (code: string, email: string) => `<!doctype html>
<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>body{margin:0;background:#0f0f0f;font-family:Segoe UI,Arial,sans-serif}.wrapper{max-width:600px;margin:auto;padding:40px 20px}.card{overflow:hidden;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px}.header{padding:40px 32px;text-align:center;background:linear-gradient(135deg,#d4a017,#f5c842)}.header h1{margin:0;color:#0f0f0f;font-size:28px;font-weight:800}.header p{margin:8px 0 0;color:#0f0f0f;font-size:14px}.body{padding:36px 32px}.title{margin:0 0 12px;color:#f5f5f5;font-size:20px;font-weight:700}.text{color:#a0a0a0;font-size:15px;line-height:1.7}.code{margin:28px 0;padding:20px;border:1px solid #55420e;border-radius:12px;background:#222;text-align:center;color:#f5c842;font-size:36px;font-weight:800;letter-spacing:10px}.footer{padding:24px 32px;border-top:1px solid #222;text-align:center;color:#555;font-size:12px}</style>
</head><body><div class="wrapper"><div class="card"><div class="header"><h1>HandyFix</h1><p>Your Trusted Home Services Marketplace</p></div><div class="body"><p class="title">Verify your provider email</p><p class="text">Use this code to verify <strong style="color:#f5f5f5">${email}</strong>. It expires in 10 minutes.</p><div class="code">${code}</div><p class="text">If you did not request this code, you can safely ignore this email.</p></div><div class="footer">© 2026 HandyFix. All rights reserved.</div></div></div></body></html>`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { provider_id, email } = await req.json();
    if (!provider_id || !email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "A valid email is required" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
    const senderName = Deno.env.get("BREVO_SENDER_NAME") ?? "HandyFix";
    if (!url || !anonKey || !serviceRoleKey || !brevoKey || !senderEmail) return json({ error: "Email verification is not configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceRoleKey);
    const { data: provider } = await admin.from("service_providers").select("id").eq("id", provider_id).eq("user_id", user.id).maybeSingle();
    if (!provider) return json({ error: "Provider not found" }, 403);

    const normalizedEmail = email.trim().toLowerCase();
    const { error: providerError } = await admin.from("service_providers").update({ email: normalizedEmail, is_email_verified: false, verified_at: null }).eq("id", provider_id);
    if (providerError) throw providerError;

    const { error: deleteError } = await admin.from("provider_otp_codes").delete().eq("provider_id", provider_id).gt("expires_at", new Date().toISOString());
    if (deleteError) throw deleteError;

    const otp_code = crypto.getRandomValues(new Uint32Array(1))[0].toString().slice(-6).padStart(6, "0");
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: insertError } = await admin.from("provider_otp_codes").insert({ provider_id, email: normalizedEmail, otp_code, expires_at });
    if (insertError) throw insertError;

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: normalizedEmail }],
        subject: "Your HandyFix verification code",
        htmlContent: otpEmail(otp_code, normalizedEmail),
      }),
    });
    if (!brevoRes.ok) {
      console.error("Brevo error:", brevoRes.status, await brevoRes.text());
      return json({ error: "Failed to send verification email" }, 502);
    }
    return json({ success: true });
  } catch (error) {
    console.error("[send-provider-otp]", error);
    return json({ error: "Unable to send verification code" }, 500);
  }
});
