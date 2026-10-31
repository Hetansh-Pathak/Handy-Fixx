import { bookingStartsAt } from "./schedule";

export type RequestOutcome =
  | "waiting" // pending: the pro is reviewing it (no countdown)
  | "expired" // pending, but the booked time has come and gone without an answer
  | "declined" // the pro said no
  | "accepted" // confirmed or later
  | "cancelled" // cancelled for another reason (by the customer, by admin)
  | "completed";

export const DECLINED_REASON = "Declined by provider";
/**
 * Written by the database when a request is still unanswered after its booked time has passed (proposal 20261118).
 * It never closes a request just because it is old: a request stays open until a pro accepts it.
 */
export const MISSED_REQUEST_REASON = "Booked time passed without an answer";

/**
 * Where a customer's request stands. Owner decision: there is no accept countdown. The pro gets a notification,
 * reviews the details (description, photos, voice note) and accepts or declines when ready. A request only lapses
 * once its booked start time has passed, because nobody can still come at a time that is already over.
 */
export function requestOutcome(
  input: { status: string; bookingDate?: string | null; bookingTime?: string | null; cancellationReason?: string | null },
  now: Date,
): RequestOutcome {
  switch (input.status) {
    case "pending": {
      const startsAt = bookingStartsAt(input.bookingDate, input.bookingTime);
      return startsAt && now.getTime() >= startsAt.getTime() ? "expired" : "waiting";
    }
    case "cancelled":
      if (input.cancellationReason === DECLINED_REASON) return "declined";
      return input.cancellationReason === MISSED_REQUEST_REASON ? "expired" : "cancelled";
    case "completed":
      return "completed";
    default:
      return "accepted";
  }
}

/**
 * Show "next best pros" when the pro said no or the time passed (PDF p.4: "No starting over").
 * @deprecated Instant dispatch (owner decision 2026-10-31): customers no longer pick a pro. Kept until the owner confirms it is unused; do not use in new code.
 */
export const needsAlternatives = (o: RequestOutcome) => o === "expired" || o === "declined";
