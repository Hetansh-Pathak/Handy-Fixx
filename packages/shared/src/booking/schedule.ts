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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Tue, 10 Nov" (hand-written: Intl support differs between Hermes builds). */
export const formatDateChip = (d: Date) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** "14:00" or "14:00:00" → "2:00 PM". Returns the input unchanged if it is not a time. */
export function formatSlot(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  if (h > 23) return time;
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Parses `yyyy-MM-dd` as a LOCAL calendar date (never via `new Date(string)`, which shifts days by timezone). */
export function parseDateString(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** `("2026-11-10", "14:00:00")` → "Tue, 10 Nov · 2:00 PM". */
export function formatBookingWhen(dateString: string | null | undefined, time: string | null | undefined): string {
  const date = dateString ? parseDateString(dateString) : null;
  const parts = [date ? formatDateChip(date) : null, time ? formatSlot(time) : null].filter(Boolean);
  return parts.join(" · ");
}
