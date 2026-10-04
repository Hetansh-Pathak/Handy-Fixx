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

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const OTP_TTL_MINUTES = 10;

const sha256 = async (value: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const emailHtml = (code: string, email: string) => `<!doctype html>
<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;background:#0f0f0f;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:600px;margin:auto;padding:40px 20px"><div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden">
<div style="padding:36px 32px;text-align:center;background:linear-gradient(135deg,#d4a017,#f5c842)"><h1 style="margin:0;color:#0f0f0f;font-size:28px">HandyFix</h1></div>
<div style="padding:32px"><p style="margin:0 0 12px;color:#f5f5f5;font-size:20px;font-weight:700">Verify your email to book</p>
<p style="color:#a0a0a0;font-size:15px;line-height:1.7">Use this code to verify <strong style="color:#f5f5f5">${email}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.</p>
<div style="margin:24px 0;padding:20px;border:1px solid #55420e;border-radius:12px;background:#222;text-align:center;color:#f5c842;font-size:36px;font-weight:800;letter-spacing:10px">${code}</div>
<p style="color:#a0a0a0;font-size:13px">Never share this code. HandyFix will never ask for it. If you didn't request it, ignore this email.</p></div></div></div></body></html>`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
    const senderName = Deno.env.get("BREVO_SENDER_NAME") ?? "HandyFix";
    if (!url || !anonKey || !serviceKey || !brevoKey || !senderEmail) return json({ error: "Email verification is not configured" }, 500);

    // Identify the caller from their JWT. The email is NEVER taken from the request body,
    // so this endpoint cannot be used to send mail to arbitrary addresses.
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || !user.email) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const email = user.email.trim().toLowerCase();

    // Rate limiting (DB-backed, per user)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await admin
      .from("customer_email_otps").select("created_at").eq("user_id", user.id)
      .gte("created_at", hourAgo).order("created_at", { ascending: false });
    if (recentErr) throw recentErr;
    if (recent && recent.length >= MAX_SENDS_PER_HOUR) return json({ error: "Too many requests. Try again in an hour." }, 429);
    if (recent && recent[0]) {
      const wait = RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - new Date(recent[0].created_at).getTime()) / 1000);
      if (wait > 0) return json({ error: `Please wait ${wait}s before requesting another code.`, retry_after: wait }, 429);
    }

    // Invalidate older codes, then issue a new one
    await admin.from("customer_email_otps").delete().eq("user_id", user.id);
    const code = (crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).toString().padStart(6, "0");
    const { error: insertErr } = await admin.from("customer_email_otps").insert({
      user_id: user.id,
      email,
      code_hash: await sha256(`${user.id}:${code}`),
      expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
    });
    if (insertErr) throw insertErr;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email }],
        subject: "Your HandyFix verification code",
        htmlContent: emailHtml(code, email),
      }),
    });
    if (!res.ok) {
      console.error("Brevo error:", res.status, await res.text());
      return json({ error: "Failed to send verification email" }, 502);
    }
    return json({ success: true, email_hint: email.replace(/^(.).*(@.*)$/, "$1***$2") });
  } catch (error) {
    console.error("[send-customer-otp]", error);
    return json({ error: "Unable to send verification code" }, 500);
  }
});
