// Pure Razorpay helpers. No remote imports and no Deno globals, so the same file runs inside the
// Supabase Edge runtime and under vitest/Node 20 (Web Crypto exists in both).

const enc = new TextEncoder();

export const toPaise = (rupees: number): number => {
  if (!Number.isFinite(rupees) || rupees <= 0) throw new Error("amount must be a positive number");
  return Math.round(rupees * 100);
};

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (no early exit on the first differing character). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Webhook: HMAC-SHA256 of the RAW request body with the webhook secret, hex, header x-razorpay-signature. */
export async function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  return safeEqual(await hmacSha256Hex(secret, rawBody), signature);
}

/** Checkout success callback: HMAC-SHA256 of "order_id|payment_id" with the API key secret. */
export async function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, keySecret: string): Promise<boolean> {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  return safeEqual(await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`), signature);
}

export const basicAuth = (keyId: string, keySecret: string) => `Basic ${btoa(`${keyId}:${keySecret}`)}`;

export type PayableBooking = {
  id: string;
  customer_id: string | null;
  user_id?: string | null;
  provider_id: string | null;
  status: string | null;
  payment_status: string | null;
  total_amount: number | null;
};

export type PayErrorCode = "not_found" | "forbidden" | "not_completed" | "already_paid" | "refunded" | "bad_amount";

/** Can THIS user pay for THIS booking right now? Returns an error code, or null when yes. */
export function checkPayable(booking: PayableBooking | null, userId: string): PayErrorCode | null {
  if (!booking) return "not_found";
  const owner = booking.customer_id ?? booking.user_id ?? null;
  if (owner !== userId) return "forbidden";
  if (booking.status !== "completed") return "not_completed";
  if (booking.payment_status === "paid") return "already_paid";
  if (booking.payment_status === "refunded") return "refunded";
  const amount = Number(booking.total_amount);
  if (!Number.isFinite(amount) || amount < 1) return "bad_amount";
  return null;
}
