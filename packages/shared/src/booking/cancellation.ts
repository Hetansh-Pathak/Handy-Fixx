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
