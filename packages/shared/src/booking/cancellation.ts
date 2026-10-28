import { bookingStartsAt } from "./schedule";

export const LATE_CANCEL_LIMIT = 3;
export const LATE_CANCEL_WINDOW_DAYS = 30;
export const INSTANT_BOOKING_PAUSE_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * "Three late cancellations in 30 days pauses instant booking for a week" (PDF p.4).
 * The PDF does not define what counts as "late"; the caller decides and passes those
 * cancellation timestamps in.
 */
export function instantBookingPause(
  lateCancellations: readonly Date[],
  now: Date,
): { paused: false } | { paused: true; until: Date } {
  const windowStart = now.getTime() - LATE_CANCEL_WINDOW_DAYS * DAY_MS;
  const recent = lateCancellations
    .map((d) => d.getTime())
    .filter((t) => t >= windowStart && t <= now.getTime())
    .sort((a, b) => a - b);
  if (recent.length < LATE_CANCEL_LIMIT) return { paused: false };
  // The pause runs for a week from the most recent late cancellation in the window.
  const limitReachedAt = recent[recent.length - 1]!;
  const until = new Date(limitReachedAt + INSTANT_BOOKING_PAUSE_DAYS * DAY_MS);
  return until.getTime() > now.getTime() ? { paused: true, until } : { paused: false };
}

export const LATE_CANCEL_HOURS = 2;
export const CUSTOMER_CANCEL_REASON = "Cancelled by customer";
/** Stored in `bookings.cancellation_reason`, so late cancellations can be counted from the bookings list. */
export const LATE_CANCEL_REASON = `${CUSTOMER_CANCEL_REASON} (late)`;

/**
 * The PDF limits "late cancellations" but does not define them. Working definition (confirm with the owner):
 * a pro had already accepted, and the customer cancels less than 2 hours before the booked start. A request
 * still waiting for an answer never counts, because no pro was committed yet.
 */
export function isLateCancellation(
  input: { status: string; bookingDate: string | null | undefined; bookingTime: string | null | undefined },
  now: Date,
): boolean {
  if (!["confirmed", "on_the_way", "arrived", "in_progress"].includes(input.status)) return false;
  const startsAt = bookingStartsAt(input.bookingDate, input.bookingTime);
  if (!startsAt) return false;
  return startsAt.getTime() - now.getTime() < LATE_CANCEL_HOURS * 3_600_000;
}

export const cancellationReasonFor = (late: boolean): string => (late ? LATE_CANCEL_REASON : CUSTOMER_CANCEL_REASON);

export function lateCancellationTimes(
  rows: readonly { status: string; cancellation_reason: string | null; cancelled_at: string | null }[],
): Date[] {
  const out: Date[] = [];
  for (const r of rows) {
    if (r.status !== "cancelled" || r.cancellation_reason !== LATE_CANCEL_REASON || !r.cancelled_at) continue;
    const d = new Date(r.cancelled_at);
    if (Number.isFinite(d.getTime())) out.push(d);
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function pauseMessage(pause: { paused: false } | { paused: true; until: Date }): string | null {
  if (!pause.paused) return null;
  const d = pause.until;
  return `Instant booking is paused until ${d.getDate()} ${MONTHS[d.getMonth()]} because of ${LATE_CANCEL_LIMIT} late cancellations in ${LATE_CANCEL_WINDOW_DAYS} days.`;
}
