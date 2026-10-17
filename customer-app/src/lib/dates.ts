/**
 * Small date helpers for booking screens. Dates from the database are plain "yyyy-MM-dd" values,
 * so they are parsed as LOCAL dates (new Date("2026-10-05") would be UTC and can show the wrong day).
 */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayNumber = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

/** Whole calendar days from b to a (positive when a is later). Unaffected by time of day or DST. */
export const calendarDaysBetween = (a: Date, b: Date) => dayNumber(a) - dayNumber(b);

export const parseLocalDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "16:30:00" -> "4:30 PM". Returns null for anything that isn't a time. */
export const formatClock = (time?: string | null): string | null => {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour > 23) return null;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m[2]} ${hour >= 12 ? "PM" : "AM"}`;
};

export const formatDay = (date: Date, now: Date = new Date()): string => {
  const diff = calendarDaysBetween(date, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const base = `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/** "Today, 4:30 PM" / "Thu, 8 Oct" / "Date not set". */
export const formatSchedule = (date?: string | null, time?: string | null, now: Date = new Date()): string => {
  const d = parseLocalDate(date);
  if (!d) return "Date not set";
  const clock = formatClock(time);
  const day = formatDay(d, now);
  return clock ? `${day}, ${clock}` : day;
};

export const timeAgo = (iso: string, now: Date = new Date()): string => {
  const then = new Date(iso);
  const seconds = (now.getTime() - then.getTime()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`;
  return `${then.getDate()} ${MONTHS[then.getMonth()]}`;
};

export type DayGroup = "Today" | "Yesterday" | "Earlier";

export const dayGroup = (iso: string, now: Date = new Date()): DayGroup => {
  const diff = calendarDaysBetween(now, new Date(iso));
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : "Earlier";
};
