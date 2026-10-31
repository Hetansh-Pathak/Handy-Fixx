import { constantTimeEqual, secretBytes } from "../_shared/crypto.ts";
import { asString, clientIp, corsHeaders, isUuid, json, readJsonObject } from "../_shared/http.ts";
import { OTP_MAX_ATTEMPTS, OTP_VERIFY_IP_LIMIT, otpMac, rateKey } from "../_shared/otp.ts";

// PROPOSAL 20261125 (finding C3), NOT DEPLOYED. Same request as before: { provider_id, otp_code } with the pro's login.
// Every guess uses one attempt atomically in the database (public.provider_otp_take_attempt): 5 wrong guesses lock the
// code, expired and used codes are refused, a right code works once (public.provider_otp_consume), the compare is
// constant-time, and each IP may make 30 guesses an hour.

export type AttemptRow = {
  status: "ok" | "none" | "expired" | "locked" | "used";
  otp_id: string | null;
  code_hash: string | null;
  salt: string | null;
  email: string | null;
  attempts_left: number;
};

export type VerifyDeps = {
  env: (name: string) => string | undefined;
  getUserId: (authorization: string) => Promise<string | null>;
  ownsProvider: (userId: string, providerId: string) => Promise<boolean>;
  rateTake: (scope: string, keys: string[], windowSeconds: number, max: number) => Promise<number>;
  takeAttempt: (providerId: string, maxAttempts: number) => Promise<AttemptRow>;
  consume: (otpId: string) => Promise<boolean>;
  /** Marks the pro's email verified, only if it is still the email the code was sent to. */
  markVerified: (providerId: string, email: string) => Promise<boolean>;
};

export function createVerifyHandler(deps: VerifyDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      const body = await readJsonObject(req);
      const providerId = asString(body.provider_id);
      const code = asString(body.otp_code);
      if (!isUuid(providerId) || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code" }, 400);

      let secret: Uint8Array;
      try {
        secret = secretBytes(deps.env("OTP_HMAC_KEY"), "OTP_HMAC_KEY");
      } catch {
        return json({ error: "Email verification is not configured" }, 500);
      }

      const userId = await deps.getUserId(req.headers.get("Authorization") ?? "");
      if (!userId) return json({ error: "Unauthorized" }, 401);
      if (!(await deps.ownsProvider(userId, providerId))) return json({ error: "Provider not found" }, 403);

      const ip = clientIp(req.headers);
      if (ip) {
        const l = OTP_VERIFY_IP_LIMIT;
        const wait = await deps.rateTake(l.scope, [await rateKey(secret, "ip", ip)], l.windowSeconds, l.max);
        if (wait > 0) return json({ error: "Too many attempts. Try again later.", retry_after: wait }, 429);
      }

      const a = await deps.takeAttempt(providerId, OTP_MAX_ATTEMPTS);
      if (a.status === "none" || a.status === "used") return json({ error: "No verification code found. Request a new one." }, 404);
      if (a.status === "expired") return json({ error: "Code expired. Request a new one." }, 410);
      if (a.status === "locked") return json({ error: "Too many wrong attempts. Request a new code." }, 429);
      if (!a.otp_id || !a.code_hash || !a.salt || !a.email) return json({ error: "No verification code found. Request a new one." }, 404);

      const ok = constantTimeEqual(await otpMac(secret, a.salt, providerId, a.email, code), a.code_hash);
      if (!ok) return json({ error: "Invalid code", attempts_left: a.attempts_left }, 400);

      if (!(await deps.consume(a.otp_id))) return json({ error: "Code already used. Request a new one." }, 409);
      if (!(await deps.markVerified(providerId, a.email))) return json({ error: "Email changed. Request a new code." }, 409);
      return json({ success: true });
    } catch (error) {
      console.error("[verify-provider-otp]", error instanceof Error ? error.message : "error");
      return json({ error: "Unable to verify code" }, 500);
    }
  };
}
