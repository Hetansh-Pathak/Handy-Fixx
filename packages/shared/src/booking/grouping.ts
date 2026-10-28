export type BookingGroups<T> = { active: T[]; past: T[] };

const ACTIVE = new Set(["pending", "confirmed", "on_the_way", "arrived", "in_progress"]);

export const isActiveBookingStatus = (status: string) => ACTIVE.has(status);

/** The customer's list: unfinished bookings first (newest first), then history (newest first). */
export function groupBookings<T extends { status: string; created_at: string | null }>(rows: readonly T[]): BookingGroups<T> {
  const time = (r: T) => (r.created_at ? new Date(r.created_at).getTime() || 0 : 0);
  const sorted = [...rows].sort((a, b) => time(b) - time(a));
  return { active: sorted.filter((r) => ACTIVE.has(r.status)), past: sorted.filter((r) => !ACTIVE.has(r.status)) };
}

/** The completion code card shows once the pro has arrived or the job has started (PDF p.10). */
/**
 * The customer's 4-digit completion code is shown from the moment the pro accepts, so it is ready on the customer's
 * phone whatever step the pro is at. It only works once the job is in progress (`complete_booking_with_code`).
 */
export const showsCompletionCode = (status: string) =>
  status === "confirmed" || status === "on_the_way" || status === "arrived" || status === "in_progress";

/** The pro's live position is only useful while they travel or are on site. */
export const showsLiveMap = (status: string) => status === "on_the_way" || status === "arrived";
