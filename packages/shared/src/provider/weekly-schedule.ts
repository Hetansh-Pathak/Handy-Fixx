import { formatSlot } from "../booking/schedule";

/**
 * The pro's weekly working hours (`provider_availability`, one row per window). The customer's time picker only
 * offers start times inside them. A pro who never set a schedule has no limit (every day, 8 AM to 8 PM).
 * This is checked in the app; the database does not refuse a booking outside the hours.
 */

export const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type DayName = (typeof DAY_NAMES)[number];
export const MIN_WINDOW_MINUTES = 60;

export type AvailabilityRow = { day_of_week: string; start_time: string; end_time: string; is_available: boolean | null };
export type Window = { start: number; end: number };

const pad = (n: number) => String(n).padStart(2, "0");

/** "9:05", "09:00" or "09:00:00" → "09:05" / "09:00"; null when it is not a clock time. */
export function normalizeClock(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

const minutesOf = (clock: string): number | null => {
  const c = normalizeClock(clock);
  return c ? Number(c.slice(0, 2)) * 60 + Number(c.slice(3)) : null;
};

const fromMinutes = (t: number): string => `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;

/** The first problem with a window the pro is saving, or null. `others` are the other windows of the same day. */
export function validateWindow(start: string, end: string, others: readonly { start: string; end: string }[]): string | null {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null) return "Enter the time like 09:00.";
  if (e <= s) return "The start time must be before the end time.";
  if (e - s < MIN_WINDOW_MINUTES) return "A working window must be at least 1 hour.";
  for (const o of others) {
    const os = minutesOf(o.start);
    const oe = minutesOf(o.end);
    if (os !== null && oe !== null && s < oe && os < e) return "This window overlaps another one on the same day.";
  }
  return null;
}

/**
 * Windows (in minutes) when the pro works on that date. Null means no limit (no schedule at all); an empty list
 * means a day off.
 */
export function windowsOn(rows: readonly AvailabilityRow[], date: Date): Window[] | null {
  if (rows.length === 0) return null;
  const day = DAY_NAMES[date.getDay()];
  const out: Window[] = [];
  for (const r of rows) {
    if (r.day_of_week !== day || r.is_available !== true) continue;
    const start = minutesOf(r.start_time);
    const end = minutesOf(r.end_time);
    if (start !== null && end !== null && end > start) out.push({ start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Keeps the start times that fall inside a window with at least an hour left to work. */
export function restrictToWindows(slots: readonly string[], windows: readonly Window[] | null): string[] {
  if (windows === null) return [...slots];
  return slots.filter((slot) => {
    const t = minutesOf(slot);
    return t !== null && windows.some((w) => t >= w.start && t + MIN_WINDOW_MINUTES <= w.end);
  });
}

export function describeDay(windows: readonly Window[]): string {
  if (windows.length === 0) return "Day off";
  return windows.map((w) => `${formatSlot(fromMinutes(w.start))} – ${formatSlot(fromMinutes(w.end))}`).join(", ");
}

/** New rows for the other days, copied from the available windows of `from`. The caller replaces those days' old rows. */
export function copyDayTo(rows: readonly AvailabilityRow[], from: string, to: readonly string[]): AvailabilityRow[] {
  const source = rows.filter((r) => r.day_of_week === from && r.is_available === true);
  const out: AvailabilityRow[] = [];
  for (const day of to) {
    if (day === from) continue;
    for (const r of source) {
      const start = normalizeClock(r.start_time);
      const end = normalizeClock(r.end_time);
      if (start && end) out.push({ day_of_week: day, start_time: start, end_time: end, is_available: true });
    }
  }
  return out;
}
