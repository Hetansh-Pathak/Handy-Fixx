import { secretBytes } from "../_shared/crypto.ts";
import { asString, corsHeaders, escapeHtml, json, readJsonObject } from "../_shared/http.ts";
import { rateKey } from "../_shared/otp.ts";

// PROPOSAL 20261125 (finding H2), NOT DEPLOYED. Before: anyone holding the public anon key could make HandyFix email any
// address with any name in the HTML. Now: the caller must be signed in, the mail goes only to the caller's own login
// email, the name is escaped and shortened, and each account gets at most one email per event per day.
// The body's `email` field is ignored (the apps still send it; harmless).

export const WELCOME_NAME_MAX = 60;
export const WELCOME_LIMIT = { windowSeconds: 86_400, max: 1 } as const;

export type WelcomeUser = { id: string; email: string | null; name: string | null };

export type WelcomeDeps = {
  env: (name: string) => string | undefined;
  getUser: (authorization: string) => Promise<WelcomeUser | null>;
  rateTake: (scope: string, keys: string[], windowSeconds: number, max: number) => Promise<number>;
  /** Sends the email. `nameHtml` is already escaped. Returns false when sending failed. */
  send: (to: string, nameHtml: string, isLogin: boolean) => Promise<boolean>;
};

export function cleanDisplayName(raw: string, email: string): string {
  const fallback = email.split("@")[0] ?? "there";
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, WELCOME_NAME_MAX);
  return name || fallback;
}

export function createWelcomeHandler(deps: WelcomeDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      const user = await deps.getUser(req.headers.get("Authorization") ?? "");
      if (!user || !user.email) return json({ error: "Unauthorized" }, 401);

      const body = await readJsonObject(req);
      const isLogin = asString(body.event) === "login";
      const email = user.email.trim().toLowerCase();
      const name = cleanDisplayName(asString(body.display_name) || user.name || "", email);

      if (!deps.env("BREVO_API_KEY") || !deps.env("BREVO_SENDER_EMAIL")) return json({ success: true, skipped: true });

      let secret: Uint8Array;
      try {
        secret = secretBytes(deps.env("OTP_HMAC_KEY"), "OTP_HMAC_KEY");
      } catch {
        return json({ error: "Email is not configured" }, 500);
      }
      const scope = isLogin ? "welcome:login" : "welcome:signup";
      const wait = await deps.rateTake(scope, [await rateKey(secret, "account", user.id)], WELCOME_LIMIT.windowSeconds, WELCOME_LIMIT.max);
      if (wait > 0) return json({ success: true, skipped: true });

      if (!(await deps.send(email, escapeHtml(name), isLogin))) return json({ error: "Failed to send email" }, 502);
      return json({ success: true });
    } catch (error) {
      console.error("[send-welcome-email]", error instanceof Error ? error.message : "error");
      return json({ error: "Unable to send email" }, 500);
    }
  };
}
