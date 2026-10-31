// Small Web Crypto helpers shared by the security functions (proposal 20261125). Plain TypeScript with no Deno or npm
// imports, so the same file runs in Supabase Edge Functions (Deno) and in the Node tests (supabase/tests/security).

const encoder = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error("not hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export const randomHex = (n: number): string => toHex(randomBytes(n));

/**
 * A secret from an Edge Function secret. Accepts base64 (what `openssl rand -base64 32` prints) or hex, and refuses
 * anything shorter than 32 bytes so a typo cannot silently weaken the key.
 */
export function secretBytes(value: string | undefined, name: string): Uint8Array {
  const v = (value ?? "").trim();
  if (!v) throw new Error(`${name} is not set`);
  let bytes: Uint8Array;
  try {
    bytes = /^[0-9a-f]+$/i.test(v) && v.length % 2 === 0 ? fromHex(v) : fromBase64(v);
  } catch {
    throw new Error(`${name} is not valid base64 or hex`);
  }
  if (bytes.length < 32) throw new Error(`${name} must be at least 32 bytes`);
  return bytes;
}

const hmacKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: Uint8Array): Promise<CryptoKey> {
  const id = toHex(secret);
  let key = hmacKeys.get(id);
  if (!key) {
    key = crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    hmacKeys.set(id, key);
  }
  return key;
}

/** HMAC-SHA256 of a text, as 64 hex characters. */
export async function hmacHex(secret: Uint8Array, message: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message));
  return toHex(new Uint8Array(sig));
}

/** Compares two strings without stopping at the first difference (length is not secret here: both are hex digests). */
export function constantTimeEqual(a: string, b: string): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
