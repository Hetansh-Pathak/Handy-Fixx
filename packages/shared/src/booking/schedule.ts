/** Time slots a customer can book (local time). */
export const BOOKING_SLOTS = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"] as const;
export type BookingSlot = (typeof BOOKING_SLOTS)[number];

/** Today plus this many days ahead can be booked. */
export const BOOKING_WINDOW_DAYS = 7;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date as `yyyy-MM-dd` (what the database stores). */
export const toDateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `08:00` → `08:00:00` (the database time column). */
export const toDbTime = (slot: BookingSlot) => `${slot}:00`;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Whole calendar days from `now` to `date` (0 = today). Using calendar days fixes the old
 * web check `date < new Date()`, which wrongly disabled today once the picker returned midnight.
 */
export function daysFromToday(date: Date, now: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

export function isBookableDate(date: Date, now: Date): boolean {
  const days = daysFromToday(date, now);
  return days >= 0 && days <= BOOKING_WINDOW_DAYS;
}

export function slotDateTime(date: Date, slot: BookingSlot): Date {
  const [h = "0", m = "0"] = slot.split(":");
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(h), Number(m), 0, 0);
}

export function isSlotAvailable(date: Date, slot: BookingSlot, now: Date, leadMinutes = 0): boolean {
  if (!isBookableDate(date, now)) return false;
  return slotDateTime(date, slot).getTime() - now.getTime() >= leadMinutes * 60_000;
}

export function slotsForDate(date: Date, now: Date, leadMinutes = 0): { slot: BookingSlot; available: boolean }[] {
  return BOOKING_SLOTS.map((slot) => ({ slot, available: isSlotAvailable(date, slot, now, leadMinutes) }));
}

/** Dates to show in the picker, today first. */
export function bookableDates(now: Date): Date[] {
  const today = startOfDay(now);
  return Array.from({ length: BOOKING_WINDOW_DAYS + 1 }, (_, i) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + i),
  );
}
