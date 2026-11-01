// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../_shared/http.ts";
import { OTP_TTL_MINUTES } from "../_shared/otp.ts";
import { emailCodeBox, emailLayout, emailParagraph } from "../_shared/email-theme.ts";
import { createSendHandler } from "./handler.ts";

// PROPOSAL 20261125 (finding C3), NOT DEPLOYED. Rules live in handler.ts (tested in supabase/tests/security).
// Secrets: OTP_HMAC_KEY (new, 32 random bytes), BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME (existing).
// Needs proposal 20261125000000 applied first (new columns + public.otp_rate_take).
// Deploy: supabase functions deploy send-provider-otp   (JWT check stays ON)

declare const Deno: { env: { get: (name: string) => string | undefined } };

const otpEmail = (code: string, email: string) => emailLayout({
  title: "Your apnabanda Pro verification code",
  preheader: `Your code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  heading: "Verify your email",
  app: "provider",
  tagline: "More jobs. Fair fee. Your area.",
  bodyHtml:
    emailParagraph(`Use this code to verify <strong>${escapeHtml(email)}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.`)
    + emailCodeBox(code)
    + emailParagraph("Never share this code. apnabanda will never ask for it. If you did not request it, ignore this email."),
});

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
        subject: "Your apnabanda Pro verification code",
        htmlContent: otpEmail(code, to),
      }),
    });
    if (!res.ok) console.error("Brevo error:", res.status);
    return res.ok;
  },
  now: () => Date.now(),
}));
