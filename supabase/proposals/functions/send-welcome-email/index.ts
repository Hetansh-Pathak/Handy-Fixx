// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../_shared/http.ts";
import { createWelcomeHandler } from "./handler.ts";

// PROPOSAL 20261125 (finding H2), NOT DEPLOYED. Rules live in handler.ts (tested in supabase/tests/security).
// Secrets: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME (existing), OTP_HMAC_KEY (new, used for the rate key).
// Needs proposal 20261125000000 applied first (public.otp_rate_take). Deploy: supabase functions deploy send-welcome-email

declare const Deno: { env: { get: (name: string) => string | undefined } };

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

const html = (nameHtml: string, email: string, isLogin: boolean) => `<!doctype html>
<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;background:#0f0f0f;font-family:Segoe UI,Arial,sans-serif"><div style="max-width:600px;margin:auto;padding:40px 20px">
<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden">
<div style="padding:36px 32px;text-align:center;background:linear-gradient(135deg,#d4a017,#f5c842)"><h1 style="margin:0;color:#0f0f0f;font-size:28px">HandyFix</h1>
<p style="margin:8px 0 0;color:#0f0f0f;font-size:14px">Your Trusted Home Services Marketplace</p></div>
<div style="padding:32px"><p style="margin:0 0 12px;color:#f5f5f5;font-size:20px;font-weight:700">${isLogin ? `Welcome back, ${nameHtml}!` : `Welcome aboard, ${nameHtml}!`}</p>
<p style="color:#a0a0a0;font-size:15px;line-height:1.7">${isLogin
  ? "You have signed in to HandyFix. Your home services are ready whenever you need them."
  : "Your HandyFix account is ready. Book verified, skilled professionals in your area."}</p>
<p style="color:#ccc;font-size:14px">Email: <span style="color:#f5c842">${escapeHtml(email)}</span></p></div>
<div style="padding:24px 32px;border-top:1px solid #222;text-align:center;color:#555;font-size:12px">© 2026 HandyFix. If this was not you, contact support.</div>
</div></div></body></html>`;

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
        sender: { name: Deno.env.get("BREVO_SENDER_NAME") ?? "HandyFix", email: Deno.env.get("BREVO_SENDER_EMAIL") },
        to: [{ email: to }],
        subject: isLogin ? "Welcome back to HandyFix" : "Welcome to HandyFix",
        htmlContent: html(nameHtml, to, isLogin),
      }),
    });
    if (!res.ok) console.error("Brevo error:", res.status);
    return res.ok;
  },
}));
