// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../_shared/http.ts";
import { OTP_TTL_MINUTES } from "../_shared/otp.ts";
import { createSendHandler } from "./handler.ts";

// PROPOSAL 20261125 (finding C3), NOT DEPLOYED. Rules live in handler.ts (tested in supabase/tests/security).
// Secrets: OTP_HMAC_KEY (new, 32 random bytes), BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME (existing).
// Needs proposal 20261125000000 applied first (new columns + public.otp_rate_take).
// Deploy: supabase functions deploy send-provider-otp   (JWT check stays ON)

declare const Deno: { env: { get: (name: string) => string | undefined } };

const otpEmail = (code: string, email: string) => `<!doctype html>
<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;background:#0f0f0f;font-family:Segoe UI,Arial,sans-serif"><div style="max-width:600px;margin:auto;padding:40px 20px">
<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden">
<div style="padding:36px 32px;text-align:center;background:linear-gradient(135deg,#d4a017,#f5c842)"><h1 style="margin:0;color:#0f0f0f;font-size:28px">apnabanda</h1></div>
<div style="padding:32px"><p style="margin:0 0 12px;color:#f5f5f5;font-size:20px;font-weight:700">Verify your provider email</p>
<p style="color:#a0a0a0;font-size:15px;line-height:1.7">Use this code to verify <strong style="color:#f5f5f5">${escapeHtml(email)}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.</p>
<div style="margin:24px 0;padding:20px;border:1px solid #55420e;border-radius:12px;background:#222;text-align:center;color:#f5c842;font-size:36px;font-weight:800;letter-spacing:10px">${code}</div>
<p style="color:#a0a0a0;font-size:13px">Never share this code. apnabanda will never ask for it. If you did not request it, ignore this email.</p></div></div></div></body></html>`;

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

serve(createSendHandler({
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
  storeCode: async (row) => {
    const { error: e1 } = await admin.from("service_providers")
      .update({ email: row.email, is_email_verified: false, verified_at: null }).eq("id", row.providerId);
    if (e1) throw e1;
    const { error: e2 } = await admin.from("provider_otp_codes").delete().eq("provider_id", row.providerId).is("consumed_at", null);
    if (e2) throw e2;
    const { error: e3 } = await admin.from("provider_otp_codes").insert({
      provider_id: row.providerId, email: row.email, code_hash: row.codeHash, salt: row.salt,
      expires_at: row.expiresAt, ip_hash: row.ipHash,
    });
    if (e3) throw e3;
  },
  sendEmail: async (to, code) => {
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
    if (!brevoKey || !senderEmail) return false;
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: Deno.env.get("BREVO_SENDER_NAME") ?? "apnabanda", email: senderEmail },
        to: [{ email: to }],
        subject: "Your apnabanda verification code",
        htmlContent: otpEmail(code, to),
      }),
    });
    if (!res.ok) console.error("Brevo error:", res.status);
    return res.ok;
  },
  now: () => Date.now(),
}));
