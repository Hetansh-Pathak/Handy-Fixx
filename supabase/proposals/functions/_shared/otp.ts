import { hmacHex, randomBytes } from "./crypto.ts";

// Provider email OTP rules (proposal 20261125, finding C3). Same spirit as the customer OTP, plus a server secret.

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/** Send limits. Every key is an HMAC, never the raw account id, email or IP. */
export const OTP_SEND_LIMITS = {
  cooldown: { scope: "provider_otp:cooldown", windowSeconds: 60, max: 1 },
  hourly: { scope: "provider_otp:send", windowSeconds: 3600, max: 5 },
  ip: { scope: "provider_otp:send_ip", windowSeconds: 3600, max: 20 },
} as const;

/** Verify limit per IP, on top of the 5 tries per code (stops one phone guessing across many accounts). */
export const OTP_VERIFY_IP_LIMIT = { scope: "provider_otp:verify_ip", windowSeconds: 3600, max: 30 } as const;

/** A uniformly random 6-digit code (rejection sampling, so no code is likelier than another). */
export function randomOtp(): string {
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  for (;;) {
    const b = randomBytes(4);
    const n = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
    if (n < limit) return String(n % 1_000_000).padStart(6, "0");
  }
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const isEmail = (email: string): boolean => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email);

/** The stored value: HMAC(server secret, salt | provider | email | code). A leaked table alone reveals no code. */
export const otpMac = (secret: Uint8Array, salt: string, providerId: string, email: string, code: string): Promise<string> =>
  hmacHex(secret, `provider-otp|v1|${salt}|${providerId}|${normalizeEmail(email)}|${code}`);

/** Rate-limit key for one kind of value. */
export const rateKey = (secret: Uint8Array, kind: "account" | "email" | "ip", value: string): Promise<string> =>
  hmacHex(secret, `rate|${kind}|${value}`);
