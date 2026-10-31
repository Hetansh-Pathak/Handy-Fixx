import { isAdult, KYC_ALLOWED_MIME, KYC_TOTAL_STEPS, validatePAN } from "./kyc";
import { normalizePan } from "./identity";

/**
 * Rules for the 8-step identity wizard in the Pro app. Everything a screen needs to decide
 * "can the pro go on?" lives here so it is tested once and the screens only call it.
 */

export const KYC_BIO_MAX = 300;
export const KYC_MAX_EXPERIENCE_YEARS = 60;

/** What the wizard knows at any moment. Documents are only "is there one?" (picked now or saved earlier). */
export type KycFacts = {
  firstName: string;
  lastName: string;
  /** yyyy-MM-dd, or "" until the pro has typed a full valid date. */
  dob: string;
  hasSelfie: boolean;
  /** What is typed in the PAN box right now (empty when a PAN is already saved: the app never gets it back). */
  panNumber: string;
  /** A PAN is already saved on the server (only its last 4 characters are known to the app). */
  panOnFile: boolean;
  hasPanDoc: boolean;
  areas: readonly string[];
  serviceIds: readonly string[];
  experienceYears: string;
  bio: string;
  termsAccepted: boolean;
};

const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u;

function nameProblem(label: "First" | "Last", value: string): string | null {
  const t = value.trim();
  if (!t) return `Enter your ${label.toLowerCase()} name as it is on your ID.`;
  if (t.length < 2) return `${label} name must be at least 2 letters.`;
  if (t.length > 40) return `${label} name is too long.`;
  if (!NAME_PATTERN.test(t)) return `${label} name can only have letters.`;
  return null;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function dobProblem(dob: string, now: Date): string | null {
  if (!dob) return "Enter your date of birth.";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) return "Enter a valid date of birth.";
  if (!isAdult(dob, now)) return "You must be 18 or older to work on apnabanda.";
  return null;
}

function experienceProblem(value: string): string | null {
  const t = value.trim();
  if (!t) return "Enter your years of experience (0 if you are new).";
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > KYC_MAX_EXPERIENCE_YEARS) {
    return `Experience must be a whole number between 0 and ${KYC_MAX_EXPERIENCE_YEARS}.`;
  }
  return null;
}

/** The first problem on a step, written for the pro, or null when the step is fine. */
export function validateKycStep(step: number, f: KycFacts, now: Date): string | null {
  switch (step) {
    case 1:
      return nameProblem("First", f.firstName) ?? nameProblem("Last", f.lastName);
    case 2:
      return dobProblem(f.dob, now);
    case 3:
      return f.hasSelfie ? null : "Take a clear selfie of your face.";
    case 4: {
      const pan = normalizePan(f.panNumber);
      if (pan) {
        if (!validatePAN(pan)) return "PAN format is ABCDE1234F: 5 letters, 4 digits, 1 letter.";
      } else if (!f.panOnFile) {
        return "Enter your PAN number.";
      }
      return f.hasPanDoc ? null : "Add a photo of your PAN card.";
    }
    case 5:
      return f.areas.length ? null : "Add at least one city where you can work.";
    case 6:
      return f.serviceIds.length ? experienceProblem(f.experienceYears) : "Pick at least one service you offer.";
    case 7:
      return f.bio.trim().length > KYC_BIO_MAX ? `Keep your bio under ${KYC_BIO_MAX} characters.` : null;
    case 8:
      return f.termsAccepted ? null : "Tick the box to agree to the Partner Agreement.";
    default:
      return "Unknown step.";
  }
}

/** Every broken step in order, so the review screen can send the pro straight back to it. */
export function validateAllKycSteps(f: KycFacts, now: Date): { step: number; message: string }[] {
  const out: { step: number; message: string }[] = [];
  for (let step = 1; step <= KYC_TOTAL_STEPS; step++) {
    const message = validateKycStep(step, f, now);
    if (message) out.push({ step, message });
  }
  return out;
}

/**
 * Where to open the wizard. A rejected application starts again at step 1 with everything filled in,
 * so the pro can fix what the admin named.
 */
export function resumeKycStep(onboardingStep: number | null | undefined, status: string | null | undefined): number {
  if (status === "rejected") return 1;
  const n = Math.trunc(Number(onboardingStep));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, KYC_TOTAL_STEPS);
}

export type KycStatusView = {
  title: string;
  note: string;
  tone: "brand" | "ok" | "danger";
  action: "start" | "resume" | "fix" | "wait" | "none";
  button: string | null;
};

/** The card on the Pro home screen. */
export function kycStatusView(status: string | null | undefined, reason: string | null | undefined, onboardingStep: number | null | undefined): KycStatusView {
  switch (status) {
    case "approved":
      return { title: "Verified", note: "Your identity is verified. You can go online and receive jobs.", tone: "ok", action: "none", button: null };
    case "pending":
      return {
        title: "Under review",
        note: "We are checking your documents. This usually takes 1–2 working days. We will tell you as soon as it is done.",
        tone: "brand", action: "wait", button: null,
      };
    case "rejected": {
      const why = reason?.trim();
      return {
        title: "Verification needs changes",
        note: why ? `The reviewer said: ${why}. Correct it and submit again.` : "Some documents were not accepted. Correct them and re-upload clear photos.",
        tone: "danger", action: "fix", button: "Fix and resubmit",
      };
    }
    default: {
      const started = (onboardingStep ?? 1) > 1;
      return {
        title: started ? "Finish your verification" : "Verify your identity to start",
        note: started
          ? "You are part-way through. Your answers are saved, so you can carry on where you stopped."
          : "An 8-step identity check keeps customers safe. It takes about 10 minutes. Keep your PAN card ready.",
        tone: "brand", action: started ? "resume" : "start", button: started ? "Continue verification" : "Start verification",
      };
    }
  }
}

// ── Date of birth typed as DD/MM/YYYY ────────────────────────────────────────

/** Adds the slashes while the pro types digits. */
export function formatDobInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "05/03/1990" → "1990-03-05", or null when it is incomplete or not a real date. */
export function parseDobInput(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1900 || !isRealDate(year, month, day)) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** yyyy-MM-dd → DD/MM/YYYY (what the pro types and sees). */
export function dobToInput(dob: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// ── Documents ────────────────────────────────────────────────────────────────

export const KYC_DOC_KEYS = ["selfie", "pan", "certificate"] as const;
export type KycDocKey = (typeof KYC_DOC_KEYS)[number];

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};

export const kycFileExtension = (mime: string): string | null => EXTENSIONS[mime] ?? null;

/**
 * The first folder must be the pro's auth user id: the storage rule only lets a pro write inside it.
 * The stamp makes every upload a new file, so a retake never overwrites a file the admin may be viewing.
 */
export function kycDocPath(userId: string, key: KycDocKey, mime: string, stamp: number): string {
  const ext = kycFileExtension(mime);
  if (!ext) throw new Error("Use a JPG, PNG, WebP or PDF file.");
  return `${userId}/${key}_${stamp}.${ext}`;
}

/** The picker sometimes gives no mime type; fall back to the file name. Anything else returns null. */
export function kycMimeType(mime: string | null | undefined, uri: string): string | null {
  const given = (mime ?? "").toLowerCase().replace("image/jpg", "image/jpeg");
  if ((KYC_ALLOWED_MIME as readonly string[]).includes(given)) return given;
  const ext = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(uri)?.[1]?.toLowerCase();
  switch (ext) {
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "pdf": return "application/pdf";
    default: return null;
  }
}

/** New size so the long side is at most `max` (phone photos are 4000+ px; the admin only needs a readable ID). Null = already small. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const longSide = Math.max(width, height);
  if (longSide <= max) return null;
  const scale = max / longSide;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// ── Saving ───────────────────────────────────────────────────────────────────

/** A readable reason for a failed save. Raw database text is never shown, except the rules written for people (P0001). */
export function kycSaveErrorMessage(error: { code?: string | null; message?: string | null }): string {
  const message = error.message ?? "";
  if (error.code === "23505") {
    if (/pan/i.test(message)) {
      return "This PAN is already linked to another provider account. Check the number, or contact support if you think this is a mistake.";
    }
  }
  if (error.code === "P0001" && message) return message;
  if (/network request failed|failed to fetch|timeout|offline/i.test(message)) {
    return "No internet connection. Check your internet and try again.";
  }
  // The app is newer than the database: a column it needs is not there yet (the identity-check upgrade is not applied).
  if (error.code === "42703" || /column .* does not exist/i.test(message)) {
    return "The identity check is being upgraded and is not ready yet. Please try again in a little while.";
  }
  return "We could not save this step. Please try again.";
}
