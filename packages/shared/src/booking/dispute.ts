export const DISPUTE_REASONS = ["poor_work", "overcharged", "no_show", "damage", "behaviour"] as const;
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

/** Reasons still open at `now`. Show "Report a problem" while this list is non-empty. */
export function openDisputeReasons(completedAt: Date, now: Date): DisputeReason[] {
  const elapsed = hoursSince(completedAt, now);
  if (elapsed < 0) return [];
  return DISPUTE_REASONS.filter((r) => elapsed <= disputeWindowHours(r));
}

export const isDisputeWindowOpen = (completedAt: Date, now: Date) => openDisputeReasons(completedAt, now).length > 0;

export const providerReplyDeadline = (raisedAt: Date) => new Date(raisedAt.getTime() + PROVIDER_REPLY_HOURS * HOUR_MS);
export const adminDecisionDeadline = (raisedAt: Date) => new Date(raisedAt.getTime() + ADMIN_DECISION_HOURS * HOUR_MS);

/** Harassment or theft skips the queue: provider suspended immediately and the case escalated. */
export const isSafetyReport = (reason: DisputeReason): boolean => reason === "behaviour";
