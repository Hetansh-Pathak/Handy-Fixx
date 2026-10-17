/** Pure helpers for the provider Schedule screen (unit tested). Times are 'HH:MM' strings. */
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Day = (typeof DAYS)[number];
export const DAY_SHORT: Record<Day, string> = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
export const DAY_LONG: Record<Day, string> = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
export const WEEKDAYS: Day[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

export type Range = { start_time: string; end_time: string };
export type RangeRow = Range & { id: string; is_available: boolean | null };

export const PRESETS: { label: string; start: string; end: string }[] = [
  { label: 'Morning', start: '09:00', end: '13:00' },
  { label: 'Afternoon', start: '13:00', end: '17:00' },
  { label: 'Evening', start: '17:00', end: '21:00' },
];

/** Accepts 'HH:MM' or 'HH:MM:SS'. */
export const norm = (t?: string | null): string => (t ?? '').slice(0, 5);
export const toMin = (t?: string | null): number => {
  const [h, m] = norm(t).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};
export const fromMin = (n: number): string => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

export function formatTime(t?: string | null): string {
  const m = toMin(t);
  if (Number.isNaN(m)) return '--';
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Why a range can't be saved, or null if it's fine. `others` are the day's other ranges. */
export function validateRange(start: string, end: string, others: Range[]): string | null {
  const s = toMin(start), e = toMin(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return 'Enter both times.';
  if (e <= s) return 'End time must be after the start time.';
  if (e - s < 60) return 'Keep each range to at least 1 hour.';
  if (others.some(o => s < toMin(o.end_time) && toMin(o.start_time) < e)) return 'This overlaps another range on the same day.';
  return null;
}

/** The first free 4-hour window from 09:00, or null if the day is full. */
export function nextFreeRange(existing: Range[]): Range | null {
  const sorted = [...existing].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  let cursor = 9 * 60;
  for (const r of sorted) {
    if (toMin(r.start_time) - cursor >= 60) break;
    cursor = Math.max(cursor, toMin(r.end_time));
  }
  const end = Math.min(cursor + 240, 22 * 60);
  return end - cursor >= 60 ? { start_time: fromMin(cursor), end_time: fromMin(end) } : null;
}

export function summarizeDay(rows: RangeRow[]): string {
  const on = rows.filter(r => r.is_available).sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  if (!on.length) return 'Day off';
  return on.map(r => `${formatTime(r.start_time)} – ${formatTime(r.end_time)}`).join(', ');
}

export function weekTotals(rows: (RangeRow & { day_of_week: string })[]) {
  const on = rows.filter(r => r.is_available);
  const minutes = on.reduce((s, r) => s + Math.max(0, toMin(r.end_time) - toMin(r.start_time)), 0);
  return { days: new Set(on.map(r => r.day_of_week)).size, hours: Math.round((minutes / 60) * 10) / 10 };
}

export const todayISO = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export const dayKey = (now = new Date()): Day => DAYS[(now.getDay() + 6) % 7];
