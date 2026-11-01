import { LAUNCH_PERIOD } from "./money/launch";

/**
 * The product name, in ONE place (owner decision 2026-11-01: HandyFix is now apnabanda). A future rename is one edit
 * here plus the technical identifiers listed in docs/CHANGES_ONE_JOB_AND_RENAME.md (package ids, schemes, npm scope).
 */
export const APP_NAME = "apnabanda";
/** The provider app. The "PRO" badge on the logo is a picture; this is the name in text. */
export const APP_NAME_PRO = "apnabanda Pro";
/** Who customers and pros write to or call: "Email apnabanda", "Call apnabanda 99…". */
export const SUPPORT_NAME = "apnabanda";
/** The label on every fee line a pro sees. The fee itself (3%, min 5, max 50) lives in money/fee.ts. */
export const PLATFORM_FEE_LABEL = "apnabanda fee";

/**
 * A server message may still carry the old name (database messages that were written before the rename and are
 * already live). Shown to a person, the old name is replaced: "HandyFix has not set a price range" -> "apnabanda ...".
 */
export function brandServerText(text: string): string {
  return text.replace(/Handy\s?Fix Pro/g, APP_NAME_PRO).replace(/Handy\s?Fix/g, APP_NAME);
}

/** Which store app the copy is for (the dev build with both shows the customer copy). */
export type BrandApp = "customer" | "provider";

export type PosterHeadline = { before: string; accent: string; after: string };
export type BrandCopy = {
  /** The line under the wordmark on the opening screen. */
  splashTagline: string;
  /** The frosted pill on the opening screen (customer only; the Pro app shows its PRO logo pill instead). */
  splashPill: string | null;
  /** The login poster headline; `accent` is shown in amber. */
  posterHeadline: PosterHeadline;
  posterSubline: string;
  /** The frosted pill on the login poster. */
  posterPill: string;
};

/** "1 month", "3 months". */
const monthsText = (months: number): string => `${months} month${months === 1 ? "" : "s"}`;

/** All the words of the opening screen and the login poster, in one place. Fee numbers come from the shared constants. */
export const BRAND_COPY: Record<BrandApp, BrandCopy> = {
  customer: {
    splashTagline: "Trusted pros. Lower prices.",
    splashPill: "Ghar ka kaam, sahi daam",
    posterHeadline: { before: "Your ", accent: "banda", after: " for every home job." },
    posterSubline: "Verified, rated, and at a fixed price.",
    posterPill: "Customer fee ₹0",
  },
  provider: {
    splashTagline: "More jobs near you",
    splashPill: null,
    posterHeadline: { before: "More jobs. ", accent: "Fair", after: " fee. Your area." },
    posterSubline: "Get requests near you. Pay a small fee only on completed jobs.",
    posterPill: `First ${LAUNCH_PERIOD.jobs} jobs or ${monthsText(LAUNCH_PERIOD.months)} fee-free`,
  },
};

export const brandCopy = (variant: string | null | undefined): BrandCopy => (variant === "provider" ? BRAND_COPY.provider : BRAND_COPY.customer);
