// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../_shared/http.ts";
import { emailFact, emailLayout, emailParagraph, emailPromises } from "../_shared/email-theme.ts";
import { createWelcomeHandler } from "./handler.ts";

// PROPOSAL 20261125 (finding H2), NOT DEPLOYED. Rules live in handler.ts (tested in supabase/tests/security).
// Secrets: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME (existing), OTP_HMAC_KEY (new, used for the rate key).
// Needs proposal 20261125000000 applied first (public.otp_rate_take). Deploy: supabase functions deploy send-welcome-email

declare const Deno: { env: { get: (name: string) => string | undefined } };

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

const html = (nameHtml: string, email: string, isLogin: boolean) => emailLayout({
  title: isLogin ? "Welcome back to apnabanda" : "Welcome to apnabanda",
  preheader: isLogin ? "You have signed in to apnabanda." : "Your apnabanda account is ready.",
  heading: isLogin ? `Welcome back, ${nameHtml}!` : `Welcome aboard, ${nameHtml}!`,
  tagline: "Verified pros. Fixed price.",
  bodyHtml:
    emailParagraph(isLogin
      ? "You have signed in to apnabanda. Your home services are ready whenever you need them."
      : "Your apnabanda account is ready. Book verified, skilled professionals in your area.")
    + emailFact("Email", escapeHtml(email))
    + emailPromises([
      ["Verified pros", "Identity checked before they take jobs"],
      ["Fixed price", "The price you see is the price you pay. Customer fee ₹0"],
      ["Track your job", "Live updates from booking to done"],
    ]),
});

serve(createWelcomeHandler({
  env: (name) => Deno.env.get(name),
  getUser: async (authorization) => {
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data } = await authClient.auth.getUser();
    const u = data?.user;
    if (!u) return null;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
    return { id: u.id as string, email: (u.email as string | undefined) ?? null, name };
  },
  rateTake: async (scope, keys, windowSeconds, max) => {
    const { data, error } = await admin.rpc("otp_rate_take", { p_scope: scope, p_keys: keys, p_window_seconds: windowSeconds, p_max: max });
    if (error) throw error;
    return Number(data ?? 0);
  },
  send: async (to, nameHtml, isLogin) => {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": Deno.env.get("BREVO_API_KEY") ?? "", "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: Deno.env.get("BREVO_SENDER_NAME") ?? "apnabanda", email: Deno.env.get("BREVO_SENDER_EMAIL") },
        to: [{ email: to }],
        subject: isLogin ? "Welcome back to apnabanda" : "Welcome to apnabanda",
        htmlContent: html(nameHtml, to, isLogin),
      }),
    });
    if (!res.ok) console.error("Brevo error:", res.status);
    return res.ok;
  },
}));
