import { randomHex, secretBytes } from "../_shared/crypto.ts";
import { asString, clientIp, corsHeaders, isUuid, json, readJsonObject } from "../_shared/http.ts";
import { OTP_SEND_LIMITS, OTP_TTL_MINUTES, isEmail, normalizeEmail, otpMac, randomOtp, rateKey } from "../_shared/otp.ts";

// PROPOSAL 20261125 (finding C3), NOT DEPLOYED. Same request as before: { provider_id, email } with the pro's login.
// What changed: the code is stored only as an HMAC with a per-code salt (secret OTP_HMAC_KEY), older codes are removed,
// sends are limited per account (1 a minute, 5 an hour), per email (5 an hour) and per IP (20 an hour).

export type SendDeps = {
  env: (name: string) => string | undefined;
  /** The signed-in user's id from the Authorization header, or null. */
  getUserId: (authorization: string) => Promise<string | null>;
  ownsProvider: (userId: string, providerId: string) => Promise<boolean>;
  /** public.otp_rate_take: 0 = allowed (and recorded), otherwise seconds to wait. */
  rateTake: (scope: string, keys: string[], windowSeconds: number, max: number) => Promise<number>;
  /** Sets the new email as unverified, deletes the pro's older codes, stores the new hash. */
  storeCode: (row: { providerId: string; email: string; codeHash: string; salt: string; expiresAt: string; ipHash: string | null }) => Promise<void>;
  sendEmail: (to: string, code: string) => Promise<boolean>;
  now: () => number;
};

export function createSendHandler(deps: SendDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      const body = await readJsonObject(req);
      const providerId = asString(body.provider_id);
      const email = normalizeEmail(asString(body.email));
      if (!isUuid(providerId) || !isEmail(email)) return json({ error: "A valid email is required" }, 400);

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
      const ipHash = ip ? await rateKey(secret, "ip", ip) : null;
      const accountKey = await rateKey(secret, "account", providerId);
      const emailKey = await rateKey(secret, "email", email);

      // Cheapest limit first: a too-quick resend is refused before it can use up the hourly allowance.
      const { cooldown, hourly, ip: ipLimit } = OTP_SEND_LIMITS;
      const waitMin = await deps.rateTake(cooldown.scope, [accountKey], cooldown.windowSeconds, cooldown.max);
      if (waitMin > 0) return json({ error: `Please wait ${waitMin}s before requesting another code.`, retry_after: waitMin }, 429);
      const waitHour = await deps.rateTake(hourly.scope, [accountKey, emailKey], hourly.windowSeconds, hourly.max);
      if (waitHour > 0) return json({ error: "Too many requests. Try again in an hour.", retry_after: waitHour }, 429);
      if (ipHash) {
        const wait = await deps.rateTake(ipLimit.scope, [ipHash], ipLimit.windowSeconds, ipLimit.max);
        if (wait > 0) return json({ error: "Too many requests. Try again later.", retry_after: wait }, 429);
      }

      const code = randomOtp();
      const salt = randomHex(16);
      await deps.storeCode({
        providerId,
        email,
        codeHash: await otpMac(secret, salt, providerId, email, code),
        salt,
        expiresAt: new Date(deps.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
        ipHash,
      });
      if (!(await deps.sendEmail(email, code))) return json({ error: "Failed to send verification email" }, 502);
      return json({ success: true });
    } catch (error) {
      console.error("[send-provider-otp]", error instanceof Error ? error.message : "error");
      return json({ error: "Unable to send verification code" }, 500);
    }
  };
}
