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
