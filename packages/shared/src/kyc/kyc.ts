export type KycStatus = "not_submitted" | "pending" | "approved" | "rejected";

export const KYC_TOTAL_STEPS = 9;

export const KYC_STEP_LABELS: Record<number, string> = {
  1: "Your Name",
  2: "Date of Birth",
  3: "Aadhaar Card",
  4: "Selfie",
  5: "PAN Card",
  6: "Working Cities",
  7: "Professions",
  8: "Extras",
  9: "Review & Submit",
};

export const TERMS_VERSION = "v1.0";

export const KYC_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const KYC_MAX_FILE_SIZE = 5 * 1024 * 1024;

export const KYC_REJECTION_REASONS = [
  "Blurry document",
  "Name mismatch",
  "Selfie unclear",
  "PAN not matching",
  "Aadhaar not matching",
  "Documents not readable",
  "Under 18",
  "Duplicate account",
  "Other",
] as const;
export type KycRejectionReason = (typeof KYC_REJECTION_REASONS)[number];

// ── Aadhaar Verhoeff checksum ────────────────────────────────────────────────
const D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
] as const;
const P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
] as const;

/** Strips spaces/dashes people type into the Aadhaar field. */
export const normalizeAadhaar = (input: string) => input.replace(/[\s-]/g, "");

/** 12 digits with a valid Verhoeff check digit. */
export function validateAadhaar(input: string): boolean {
  const number = normalizeAadhaar(input);
  if (!/^\d{12}$/.test(number)) return false;
  let c = 0;
  const digits = number.split("").reverse();
  for (let i = 0; i < digits.length; i++) {
    c = D[c]![P[i % 8]![Number(digits[i])]!]!;
  }
  return c === 0;
}

/** PAN format AAAAA9999A (uppercase). */
export const validatePAN = (pan: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);

export const maskAadhaar = (last4: string) => `XXXX XXXX ${last4}`;

export function maskPAN(pan: string): string {
  if (!pan || pan.length !== 10) return pan;
  return `XXXXX${pan.slice(5, 9)}${pan[9]}`;
}

/** Works with browser `File` and with React Native picker assets (`mimeType`, `fileSize`). */
export function validateKycFile(file: { type?: string | null; mimeType?: string | null; size?: number | null; fileSize?: number | null }): string | null {
  const mime = file.type ?? file.mimeType ?? "";
  const size = file.size ?? file.fileSize ?? 0;
  if (!(KYC_ALLOWED_MIME as readonly string[]).includes(mime)) return "Invalid file type. Allowed: JPG, PNG, WebP, PDF.";
  if (size > KYC_MAX_FILE_SIZE) return "File too large. Maximum size is 5 MB.";
  return null;
}

/** Providers must be 18 or older. `dob` is `yyyy-MM-dd`. */
export function isAdult(dob: string, now: Date, minAge = 18): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(y, mo - 1, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== mo - 1 || birth.getDate() !== d) return false;
  const cutoff = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
  return birth.getTime() <= cutoff.getTime();
}
