export type KycStatus = "not_submitted" | "pending" | "approved" | "rejected";

export const KYC_TOTAL_STEPS = 8;

/** Aadhaar is no longer collected (owner decision 2026-10-31): PAN, selfie and a bank / UPI name match are the checks. */
export const KYC_STEP_LABELS: Record<number, string> = {
  1: "Your Name",
  2: "Date of Birth",
  3: "Selfie",
  4: "PAN Card",
  5: "Working Cities",
  6: "Professions",
  7: "Extras",
  8: "Review & Submit",
};

export const TERMS_VERSION = "v1.3";

export const KYC_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const KYC_MAX_FILE_SIZE = 5 * 1024 * 1024;

export const KYC_REJECTION_REASONS = [
  "Blurry document",
  "Name mismatch",
  "Selfie unclear",
  "PAN not matching",
  "Bank or UPI name does not match",
  "Documents not readable",
  "Under 18",
  "Duplicate account",
  "Other",
] as const;
export type KycRejectionReason = (typeof KYC_REJECTION_REASONS)[number];

/** PAN format AAAAA9999A (uppercase). */
export const validatePAN = (pan: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);

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
