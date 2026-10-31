/**
 * PAN and identity helpers. The Pro app never stores or reads a full PAN back: it sends the number once to the
 * `kyc-pan` Edge Function (proposal 20261125000001) and keeps only `pan_last4`. The functions below are the app-side
 * rules; the Edge Function has twins in supabase/proposals/functions/_shared/pan-crypto.ts, and both test files check
 * the same fixtures (blind-index input strings) so the two sides cannot drift apart.
 */

/** Strips spaces and dashes and upper-cases what people type into the PAN box. */
export const normalizePan = (input: string): string => input.toUpperCase().replace(/[\s-]/g, "");

/** The last four characters, e.g. "234F" for ABCDE1234F. */
export const panLast4 = (pan: string): string => normalizePan(pan).slice(-4);

/** How a saved PAN is shown: only the last four characters. */
export function maskPanLast4(last4: string | null | undefined): string {
  return /^[0-9]{3}[A-Z]$/.test(last4 ?? "") ? `XXXXXX${last4}` : "Not added";
}

/** An Indian mobile as its last ten digits, so "+91 98250 12345" and "098250 12345" match. */
export const normalizePhone = (input: string): string => input.replace(/\D/g, "").slice(-10);

/** A bank / UPI account holder name: letters only, single spaces, upper case. */
export const normalizeBankName = (input: string): string =>
  input.toUpperCase().replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();

/** The exact text the server hashes (HMAC) for the duplicate / blocklist checks. */
export function blindIndexInput(kind: "pan" | "phone" | "bank_account_name", value: string): string {
  const v = kind === "pan" ? normalizePan(value) : kind === "phone" ? normalizePhone(value) : normalizeBankName(value);
  return `${kind}|v1|${v}`;
}

const SKIP_WORDS = new Set(["MR", "MRS", "MS", "SHRI", "SMT", "SRI", "KUMAR", "DR"]);

function nameTokens(name: string): string[] {
  return normalizeBankName(name).split(" ").filter((t) => t.length > 0 && !SKIP_WORDS.has(t));
}

export type NameMatch = "match" | "partial" | "mismatch" | "unknown";

/**
 * Does the name on the bank account or UPI id belong to the person whose KYC this is?
 *   match    every word of the shorter name appears in the longer one (order ignored, titles ignored, "R" matches "RAVI"),
 *            and at least one of them is a whole word (initials alone are only "partial")
 *   partial  at least one full word is shared (a middle name is missing, or one of two names differs): a human decides
 *   mismatch no word in common
 *   unknown  one of the names is empty
 * This is a hint for the admin who reviews the application; it never approves or rejects anyone by itself.
 */
export function bankNameMatch(kycName: string | null | undefined, accountName: string | null | undefined): NameMatch {
  const a = nameTokens(kycName ?? "");
  const b = nameTokens(accountName ?? "");
  if (!a.length || !b.length) return "unknown";
  const same = (x: string, y: string) => x === y || (x.length === 1 && y.startsWith(x)) || (y.length === 1 && x.startsWith(y));
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Set<number>();
  let hits = 0;
  for (const t of short) {
    const i = long.findIndex((u, idx) => !used.has(idx) && same(t, u));
    if (i >= 0) { used.add(i); hits++; }
  }
  const fullWordShared = short.some((t) => t.length > 1 && long.includes(t));
  if (hits === short.length) return fullWordShared ? "match" : "partial"; // initials alone never prove it is the same person
  return fullWordShared ? "partial" : "mismatch";
}
