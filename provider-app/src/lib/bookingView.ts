/** Pure helpers for the provider Bookings list (unit tested). */
export type BookingStatus = 'pending' | 'confirmed' | 'on_the_way' | 'in_progress' | 'completed' | 'cancelled';
export type TabKey = 'new' | 'upcoming' | 'active' | 'done' | 'cancelled';

export const OPEN_JOB_EVENT = 'handyfix:open-job';

/** One booking belongs to exactly one tab (the old list double-counted on_the_way). */
export function tabOf(status: string, etaMinutes?: number | null): TabKey {
  switch (status) {
    case 'pending': return 'new';
    case 'confirmed': return 'upcoming';
    case 'on_the_way':
    case 'in_progress': return 'active';
    case 'completed': return 'done';
    default: return 'cancelled';
  }
}

export function statusLabel(status: string, etaMinutes?: number | null): string {
  if (status === 'on_the_way') return etaMinutes === 0 ? 'Arrived' : 'On the way';
  if (status === 'in_progress') return 'Work in progress';
  if (status === 'confirmed') return 'Accepted';
  if (status === 'pending') return 'New request';
  if (status === 'completed') return 'Completed';
  return 'Cancelled';
}

export type Tone = 'gold' | 'black' | 'green' | 'red';
export const toneOf = (status: string): Tone =>
  status === 'pending' ? 'gold' : status === 'completed' ? 'green' : status === 'cancelled' ? 'red' : 'black';

/** Provider's take: stored amount, else total minus fee, else total. */
export function earningsOf(b: { provider_amount?: number | null; total_amount?: number | null; platform_fee?: number | null }): number | null {
  if (b.provider_amount != null) return Number(b.provider_amount);
  if (b.total_amount != null) return Number(b.total_amount) - Number(b.platform_fee ?? 0);
  return null;
}

/** Local Date from 'YYYY-MM-DD' (new Date('YYYY-MM-DD') parses as UTC and can show the wrong day). */
export function parseLocalDate(date?: string | null, time?: string | null): Date | null {
  if (!date) return null;
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (time ?? '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function whenLabel(date?: string | null, time?: string | null, now = new Date()): string {
  const dt = parseLocalDate(date, time);
  if (!dt) return 'Time not set';
  const day0 = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day0(dt) - day0(now)) / 86_400_000);
  const t = time ? dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  const d = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday'
    : dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return t ? `${d}, ${t}` : d;
}

export const TAB_ORDER: TabKey[] = ['new', 'upcoming', 'active', 'done', 'cancelled'];
export const TAB_LABEL: Record<TabKey, string> = { new: 'New', upcoming: 'Upcoming', active: 'Active', done: 'Done', cancelled: 'Cancelled' };

/** Tab to open on: most urgent non-empty one. */
export function defaultTab(counts: Record<TabKey, number>): TabKey {
  return (['active', 'new', 'upcoming', 'done', 'cancelled'] as TabKey[]).find(t => counts[t] > 0) ?? 'new';
}
