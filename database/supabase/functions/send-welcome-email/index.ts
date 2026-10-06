// Supabase resolves this remote import in its Deno Edge Function runtime.
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, escapeHtml } from "../_shared/cors.ts";

declare const Deno: {
  env: {
    get: (name: string) => string | undefined;
  };
};


serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Identify the caller from their JWT. The recipient is ALWAYS the authenticated user's own
    // email — never a value from the request body — so this cannot be used as a mail relay.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: "Not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || !user.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const email = user.email.trim().toLowerCase();
    const event = body?.event === "login" ? "login" : "signup";
    const rawName = String(body?.display_name ?? "").slice(0, 60) || email.split("@")[0];
    const name = escapeHtml(rawName);

    const isLogin = event === "login";
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
    const senderName = Deno.env.get("BREVO_SENDER_NAME") ?? "HandyFix";

    // ── Option A: Use Brevo API if key + sender are configured ─────────────
    if (brevoKey && senderEmail) {
      const htmlBody = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${isLogin ? "Welcome back to HandyFix" : "Welcome to HandyFix"}</title>
    <style>
      body { margin: 0; padding: 0; background: #0f0f0f; font-family: 'Segoe UI', Arial, sans-serif; }
      .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
      .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; overflow: hidden; }
      .header { background: linear-gradient(135deg, #d4a017, #f5c842); padding: 40px 32px; text-align: center; }
      .header h1 { margin: 0; color: #0f0f0f; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
      .header p { margin: 8px 0 0; color: #0f0f0f; opacity: 0.7; font-size: 14px; }
      .body { padding: 36px 32px; }
      .greeting { color: #f5f5f5; font-size: 20px; font-weight: 700; margin: 0 0 12px; }
      .text { color: #a0a0a0; font-size: 15px; line-height: 1.7; margin: 0 0 24px; }
      .info-box { background: #222; border: 1px solid #333; border-radius: 10px; padding: 16px 20px; margin: 0 0 28px; }
      .info-box p { margin: 4px 0; color: #ccc; font-size: 14px; }
      .info-box span { color: #f5c842; font-weight: 600; }
      .btn { display: inline-block; background: linear-gradient(135deg, #d4a017, #f5c842); color: #0f0f0f !important; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 10px; text-decoration: none; letter-spacing: 0.3px; }
      .btn-wrap { text-align: center; margin: 0 0 32px; }
      .features { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0 0 32px; }
      .feature { background: #222; border-radius: 10px; padding: 16px; border: 1px solid #2a2a2a; }
      .feature .icon { font-size: 22px; margin-bottom: 6px; }
      .feature .label { color: #f5f5f5; font-size: 13px; font-weight: 600; margin: 0; }
      .feature .sub { color: #707070; font-size: 12px; margin: 4px 0 0; }
      .footer { border-top: 1px solid #222; padding: 24px 32px; text-align: center; }
      .footer p { margin: 4px 0; color: #555; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">

        <!-- Header -->
        <div class="header">
          <h1>🏠 HandyFix</h1>
          <p>Your Trusted Home Services Marketplace</p>
        </div>

        <!-- Body -->
        <div class="body">
          <p class="greeting">${isLogin ? `Welcome back, ${name}! 👋` : `Welcome aboard, ${name}! 🎉`}</p>
          <p class="text">
            ${isLogin ? "You have successfully signed in to HandyFix. Your trusted home services are ready whenever you need them." : "Your HandyFix account has been successfully created. You're now part of India's most trusted home services marketplace — connecting you with verified, skilled professionals in your area."}
          </p>

          <!-- Account info -->
          <div class="info-box">
            <p>📧 Email: <span>${email}</span></p>
            <p>🔐 Status: <span>✅ Active</span></p>
            <p>📍 Platform: <span>HandyFix</span></p>
          </div>

          <!-- CTA -->
          <div class="btn-wrap">
            <a href="https://handyfix.in/services" class="btn">Book a Service Now →</a>
          </div>

          <!-- Features -->
          <div class="features">
            <div class="feature">
              <div class="icon">🔧</div>
              <p class="label">10+ Services</p>
              <p class="sub">Plumbing to AC repair</p>
            </div>
            <div class="feature">
              <div class="icon">✅</div>
              <p class="label">Verified Pros</p>
              <p class="sub">Background checked</p>
            </div>
            <div class="feature">
              <div class="icon">📅</div>
              <p class="label">Track Bookings</p>
              <p class="sub">Real-time updates</p>
            </div>
            <div class="feature">
              <div class="icon">⭐</div>
              <p class="label">Rate & Review</p>
              <p class="sub">After every service</p>
            </div>
          </div>

          <p class="text" style="margin: 0;">
            Need help? Just reply to this email or visit our <a href="https://handyfix.in/contact" style="color: #f5c842;">Help Center</a>.
          </p>
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>© 2026 HandyFix. All rights reserved.</p>
          <p>Made with ❤️ in India</p>
          <p style="margin-top: 10px;">
            <a href="https://handyfix.in/contact" style="color: #555; text-decoration: none;">Unsubscribe</a>
          </p>
        </div>
      </div>
    </div>
  </body>
</html>
      `.trim();

      const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
          "accept": "application/json",
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email }],
          subject: isLogin ? "Welcome back to HandyFix!" : "Welcome to HandyFix! 🏠",
          htmlContent: htmlBody,
        }),
      });

      if (!brevoRes.ok) {
        console.error("Brevo error:", brevoRes.status, await brevoRes.text());
        return new Response(
          JSON.stringify({ error: "Failed to send email" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Option B: No Brevo key/sender — log and return success (Supabase SMTP handles it) ──
    console.log(`[send-welcome-email] No BREVO_API_KEY/BREVO_SENDER_EMAIL set. Skipping.`);
    return new Response(
      JSON.stringify({ success: true, message: "No email provider configured — skipped." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[send-welcome-email] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Unable to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
