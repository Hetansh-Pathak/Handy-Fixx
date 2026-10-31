export type LegalSection = { heading: string; body: string[] };

/** Everything that differs between installations. Optional lines are left out when a value is missing. */
export type LegalContext = {
  supportEmail: string;
  /** Legal name of the company running HandyFix, when there is one. */
  entityName?: string;
  /** Postal address, when it should be published. */
  address?: string;
  /** Name or title of the grievance officer (India: required for platforms). Defaults to "the HandyFix support team". */
  grievanceOfficer?: string;
};

export type LegalDocKey = "privacy" | "terms" | "deletion";

export type LegalDoc = { key: LegalDocKey; title: string; version: string; updated: string; intro: string; sections: LegalSection[] };

/** Bump `version` and `updated` whenever the meaning of a document changes. */
export const LEGAL_VERSION = "1.1";
export const LEGAL_UPDATED = "1 November 2026";

export const operator = (ctx: LegalContext): string => (ctx.entityName?.trim() ? `${ctx.entityName.trim()} ("HandyFix", "we", "us")` : `HandyFix ("we", "us")`);

export const contactLines = (ctx: LegalContext): string[] => {
  const lines = [`Email: ${ctx.supportEmail}`];
  if (ctx.address?.trim()) lines.push(`Address: ${ctx.address.trim()}`);
  lines.push(`Grievance officer: ${ctx.grievanceOfficer?.trim() || "the HandyFix support team"} (write to ${ctx.supportEmail}; we reply within 24 hours and resolve within 15 days).`);
  return lines;
};
