const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A customer picks any start time on a clock, inside working hours, in 15-minute steps (local time, "HH:MM").
 * The database stores it as a plain `time`, so no slot list is needed there.
 */
export const BOOKING_OPENS_AT = "08:00";
/** Latest start time a customer can pick. */
export const BOOKING_LAST_START = "20:00";
export const BOOKING_MINUTE_STEP = 15;
/** How far ahead a booking must start, so the pro has time to review the request and travel. */
export const BOOKING_LEAD_MINUTES = 60;

/** A start time as "HH:MM" (24-hour). */
export type BookingSlot = string;

const minutesOf = (time: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

const fromMinutes = (total: number): string => `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;

/** Inside working hours and on a 15-minute step. */
export function isBookingTime(time: string): boolean {
  const t = minutesOf(time);
  const open = minutesOf(BOOKING_OPENS_AT)!;
  const last = minutesOf(BOOKING_LAST_START)!;
  return t !== null && t >= open && t <= last && t % BOOKING_MINUTE_STEP === 0;
}

/** Today plus this many days ahead can be booked. */
export const BOOKING_WINDOW_DAYS = 7;


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
  if (!isBookingTime(slot) || !isBookableDate(date, now)) return false;
  return slotDateTime(date, slot).getTime() - now.getTime() >= leadMinutes * 60_000;
}

/** Every start time a customer could pick on that day, earliest first (past or too-soon times left out). */
export function availableTimes(date: Date, now: Date, leadMinutes = BOOKING_LEAD_MINUTES): BookingSlot[] {
  const out: BookingSlot[] = [];
  for (let t = minutesOf(BOOKING_OPENS_AT)!; t <= minutesOf(BOOKING_LAST_START)!; t += BOOKING_MINUTE_STEP) {
    const time = fromMinutes(t);
    if (isSlotAvailable(date, time, now, leadMinutes)) out.push(time);
  }
  return out;
}

export const firstAvailableTime = (date: Date, now: Date, leadMinutes = BOOKING_LEAD_MINUTES): BookingSlot | null =>
  availableTimes(date, now, leadMinutes)[0] ?? null;

// ── clock face ──────────────────────────────────────────────────────────────────────────────

export const CLOCK_MINUTES = [0, 15, 30, 45] as const;
export type ClockTime = { hour: number; minute: number; pm: boolean };

/** "14:30" → { hour: 2, minute: 30, pm: true }. */
export function toClock(time: BookingSlot): ClockTime | null {
  const t = minutesOf(time);
  if (t === null) return null;
  const h = Math.floor(t / 60);
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: t % 60, pm: h >= 12 };
}

/** { hour: 12, minute: 0, pm: false } → "00:00"; { hour: 12, pm: true } → "12:00". */
export function fromClock(c: ClockTime): BookingSlot {
  const h = (c.hour % 12) + (c.pm ? 12 : 0);
  return fromMinutes(h * 60 + c.minute);
}

/**
 * The bookable time nearest to what the clock shows: same hour if possible, otherwise the first free time.
 * Used when the customer taps an hour or flips AM/PM, so the picker never sits on an impossible time.
 */
export function snapToAvailable(wanted: BookingSlot, options: readonly BookingSlot[]): BookingSlot | null {
  if (options.includes(wanted)) return wanted;
  const hour = wanted.slice(0, 2);
  return options.find((o) => o.startsWith(hour)) ?? options.find((o) => o > wanted) ?? options[options.length - 1] ?? null;
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

/** When a stored booking starts (`"2026-11-10"`, `"14:30:00"`), local time. Null if either part is missing or invalid. */
export function bookingStartsAt(dateString: string | null | undefined, time: string | null | undefined): Date | null {
  const date = dateString ? parseDateString(dateString) : null;
  const hhmm = (time ?? "").slice(0, 5);
  if (!date || minutesOf(hhmm) === null) return null;
  return slotDateTime(date, hhmm);
}
