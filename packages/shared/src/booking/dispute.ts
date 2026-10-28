/** Same list and spelling as the database (`booking_disputes.category`). */
export const DISPUTE_REASONS = ["poor_work", "overcharged", "no_show", "damage", "behaviour", "safety"] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_OUTCOMES = ["dismissed", "redo", "partial_refund", "provider_penalty"] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

/** Window in which a customer may raise a dispute after completion. */
export const DISPUTE_WINDOW_HOURS = 24;
/** Longer window for repair-quality complaints. */
export const REPAIR_QUALITY_WINDOW_HOURS = 48;
export const PROVIDER_REPLY_HOURS = 24;
export const ADMIN_DECISION_HOURS = 48;
export const REDO_WARRANTY_DAYS = 7;

const HOUR_MS = 3_600_000;

export const disputeWindowHours = (reason: DisputeReason): number =>
  reason === "poor_work" ? REPAIR_QUALITY_WINDOW_HOURS : DISPUTE_WINDOW_HOURS;

const hoursSince = (from: Date, now: Date) => (now.getTime() - from.getTime()) / HOUR_MS;

/**
 * Reasons still open at `now`. A safety report (harassment, theft) has no window, like the database rule,
 * so it is only listed while a normal reason is also open or on its own after the window closes.
 */
export function openDisputeReasons(completedAt: Date, now: Date): DisputeReason[] {
  const elapsed = hoursSince(completedAt, now);
  if (elapsed < 0) return [];
  return DISPUTE_REASONS.filter((r) => isSafetyReport(r) || elapsed <= disputeWindowHours(r));
}

/** True while a normal (non-safety) report can still be raised. Drives the "Report a problem" button. */
export const isDisputeWindowOpen = (completedAt: Date, now: Date) =>
  openDisputeReasons(completedAt, now).some((r) => !isSafetyReport(r));

export const providerReplyDeadline = (raisedAt: Date) => new Date(raisedAt.getTime() + PROVIDER_REPLY_HOURS * HOUR_MS);
export const adminDecisionDeadline = (raisedAt: Date) => new Date(raisedAt.getTime() + ADMIN_DECISION_HOURS * HOUR_MS);

/** Harassment or theft skips the queue: provider suspended immediately and the case escalated. */
export function isSafetyReport(reason: DisputeReason): boolean {
  return reason === "safety";
}

export const DISPUTE_REASON_LABEL: Record<DisputeReason, string> = {
  poor_work: "Poor work or repair quality",
  overcharged: "Overcharged",
  no_show: "Pro did not come",
  damage: "Something was damaged",
  behaviour: "Rude or unprofessional",
  safety: "Harassment or theft (urgent)",
};

export const DISPUTE_OUTCOME_LABEL: Record<DisputeOutcome, string> = {
  dismissed: "Dismissed: the work was fine",
  redo: `Redo: the pro returns free within ${REDO_WARRANTY_DAYS} days`,
  partial_refund: "Partial refund: settle at an adjusted amount",
  provider_penalty: "Provider penalty: warning, ranking drop or suspension",
};

export const DISPUTE_DETAILS_MIN = 10;
export const DISPUTE_DETAILS_MAX = 1000;
export const DISPUTE_REPLY_MIN = 5;
export const DISPUTE_APPEAL_MIN = 10;

export type DisputeStatus = "open" | "decided" | "appealed" | "closed";

/** The parts of a `booking_disputes` row the apps need. */
export type DisputeView = {
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  providerReply: string | null;
  appealedAt: string | null;
};

/** What each side may do next. Mirrors reply_booking_dispute / appeal_booking_dispute. */
export function disputeActions(d: DisputeView, side: "customer" | "provider"): { canReply: boolean; canAppeal: boolean } {
  return {
    canReply: side === "provider" && d.status === "open" && !d.providerReply,
    canAppeal: d.status === "decided" && !d.appealedAt,
  };
}

/** One line for the dispute card. */
export function disputeStatusText(d: DisputeView): string {
  if (d.status === "open") return d.providerReply ? "The pro has replied. An admin decides within 48 hours." : "Reported. The pro can reply within 24 hours; an admin decides within 48 hours.";
  if (d.status === "appealed") return "Appealed. A second admin is reviewing it.";
  const outcome = d.outcome ? DISPUTE_OUTCOME_LABEL[d.outcome] : "Decided";
  return d.status === "closed" ? `Final decision. ${outcome}.` : `${outcome}.`;
}

/** Field check before calling the database (the database checks again). */
export function validateDisputeDetails(details: string): string | null {
  const n = details.trim().length;
  if (n < DISPUTE_DETAILS_MIN) return `Describe what happened (at least ${DISPUTE_DETAILS_MIN} characters).`;
  if (n > DISPUTE_DETAILS_MAX) return `Keep it under ${DISPUTE_DETAILS_MAX} characters.`;
  return null;
}

const DISPUTE_REASON_MESSAGE: Record<string, string> = {
  unauthorized: "You cannot do this for this booking.",
  not_completed: "You can report a problem once the job is completed.",
  invalid_category: "Pick what went wrong.",
  invalid_details: `Describe what happened (${DISPUTE_DETAILS_MIN} to ${DISPUTE_DETAILS_MAX} characters).`,
  window_closed: "The time to report this problem has passed.",
  already_reported: "A problem was already reported for this booking.",
  closed: "This case is no longer open for a reply.",
  already_replied: "You have already replied.",
  invalid_reply: `Write a reply (at least ${DISPUTE_REPLY_MIN} characters).`,
  cannot_appeal: "This decision cannot be appealed (each side can appeal once, after a decision).",
  invalid_note: `Explain the appeal (at least ${DISPUTE_APPEAL_MIN} characters).`,
  not_found: "This case was not found.",
};

/** Turns `{ ok: false, reason }` from the dispute functions into a sentence. */
export const disputeErrorMessage = (reason: string | null | undefined): string =>
  (reason && DISPUTE_REASON_MESSAGE[reason]) || "Something went wrong. Try again.";
