import { fromBase64, hmacHex, randomBytes, secretBytes, toBase64 } from "./crypto.ts";

// PAN encryption for proposal 20261125000001 (finding H3). Web Crypto only: AES-256-GCM with a fresh random 96-bit
// nonce per value, the row's provider id as additional data (a ciphertext copied onto another pro's row does not
// decrypt), and a key version so keys can be rotated. Blind indexes are HMAC-SHA256 with a SEPARATE key.
//
// Secrets (Edge Function secrets, never in the app or the database):
//   KYC_PAN_KEY          the current AES key, 32 random bytes (base64 or hex)
//   KYC_PAN_KEY_VERSION  its version number (default 1); raise it on every rotation
//   KYC_PAN_KEY_V<n>     older keys kept for reading rows written before a rotation (e.g. KYC_PAN_KEY_V1)
//   KYC_PAN_HMAC_KEY     the blind-index key, 32 random bytes. Changing it means re-indexing every row (script).

/** Same rules as packages/shared/src/kyc/kyc.ts (normalizePan / validatePAN); a test keeps them in step. */
export const normalizePan = (input: string): string => input.toUpperCase().replace(/[\s-]/g, "");
export const isValidPan = (pan: string): boolean => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
export const panLast4 = (pan: string): string => normalizePan(pan).slice(-4);

/** Phone as its last 10 digits (Indian mobile), so +91 98xxx and 098xxx match. */
export const normalizePhone = (input: string): string => input.replace(/\D/g, "").slice(-10);
/** Bank account holder name: letters only, single spaces, upper case. */
export const normalizeBankName = (input: string): string =>
  input.toUpperCase().replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();

/** The exact text that is HMAC-ed. Shared with the app tests (packages/shared panBlindIndexInput). */
export const blindIndexInput = (kind: "pan" | "phone" | "bank_account_name", value: string): string => {
  const v = kind === "pan" ? normalizePan(value) : kind === "phone" ? normalizePhone(value) : normalizeBankName(value);
  return `${kind}|v1|${v}`;
};

export type Keyring = { current: number; keys: Map<number, CryptoKey>; hmac: Uint8Array };

export async function loadKeyring(env: (name: string) => string | undefined): Promise<Keyring> {
  const current = Number(env("KYC_PAN_KEY_VERSION") ?? "1");
  if (!Number.isInteger(current) || current < 1 || current > 32767) throw new Error("KYC_PAN_KEY_VERSION must be a whole number from 1");
  const raw = new Map<number, Uint8Array>([[current, secretBytes(env("KYC_PAN_KEY"), "KYC_PAN_KEY")]]);
  for (let v = 1; v < current; v++) {
    const old = env(`KYC_PAN_KEY_V${v}`);
    if (old) raw.set(v, secretBytes(old, `KYC_PAN_KEY_V${v}`));
  }
  const keys = new Map<number, CryptoKey>();
  for (const [v, bytes] of raw) {
    if (bytes.length !== 32) throw new Error(`KYC_PAN key version ${v} must be exactly 32 bytes`);
    keys.set(v, await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]));
  }
  const hmac = secretBytes(env("KYC_PAN_HMAC_KEY"), "KYC_PAN_HMAC_KEY");
  return { current, keys, hmac };
}

export type SealedPan = { ciphertext: string; nonce: string; version: number };

const aad = (providerId: string) => new TextEncoder().encode(`provider_kyc|pan|${providerId}`);

export async function encryptPan(ring: Keyring, pan: string, providerId: string): Promise<SealedPan> {
  const value = normalizePan(pan);
  if (!isValidPan(value)) throw new Error("Invalid PAN");
  const key = ring.keys.get(ring.current);
  if (!key) throw new Error("Current PAN key missing");
  const nonce = randomBytes(12);
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(providerId), tagLength: 128 },
    key, new TextEncoder().encode(value));
  return { ciphertext: toBase64(new Uint8Array(sealed)), nonce: toBase64(nonce), version: ring.current };
}

/** Throws when the key version is unknown, the key is wrong, or the ciphertext / nonce / provider id was changed. */
export async function decryptPan(ring: Keyring, sealed: SealedPan, providerId: string): Promise<string> {
  const key = ring.keys.get(sealed.version);
  if (!key) throw new Error(`PAN key version ${sealed.version} is not loaded`);
  const nonce = fromBase64(sealed.nonce);
  if (nonce.length !== 12) throw new Error("Bad nonce");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(providerId), tagLength: 128 },
    key, fromBase64(sealed.ciphertext));
  const pan = new TextDecoder().decode(plain);
  if (!isValidPan(pan)) throw new Error("Decrypted value is not a PAN");
  return pan;
}

export const blindIndex = (ring: Keyring, kind: "pan" | "phone" | "bank_account_name", value: string): Promise<string> =>
  hmacHex(ring.hmac, blindIndexInput(kind, value));

/** Blind index of an optional value: null when there is nothing meaningful to index. */
export async function optionalBlindIndex(ring: Keyring, kind: "phone" | "bank_account_name", value: string | null | undefined): Promise<string | null> {
  const v = kind === "phone" ? normalizePhone(value ?? "") : normalizeBankName(value ?? "");
  if (kind === "phone" ? v.length !== 10 : v.length < 3) return null;
  return blindIndex(ring, kind, v);
}
