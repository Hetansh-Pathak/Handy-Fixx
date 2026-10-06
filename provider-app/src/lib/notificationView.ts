/** Pure helpers for the provider Notifications screen (unit tested). */
export type NoticeKind = 'booking' | 'cancelled' | 'review' | 'payment' | 'other';
export type NoticeTone = 'gold' | 'black' | 'green' | 'red';

export const kindOf = (type?: string | null): NoticeKind => {
  switch (type) {
    case 'new_booking': return 'booking';
    case 'booking_cancelled': return 'cancelled';
    case 'new_review': return 'review';
    case 'payment': return 'payment';
    default: return 'other';
  }
};

export const toneOfKind = (k: NoticeKind): NoticeTone =>
  k === 'booking' ? 'gold' : k === 'cancelled' ? 'red' : k === 'payment' ? 'green' : 'black';

export const routeOfKind = (k: NoticeKind): string | null =>
  k === 'booking' || k === 'cancelled' ? '/provider-panel/bookings'
    : k === 'review' ? '/provider-panel/reviews'
    : k === 'payment' ? '/provider-panel/earnings' : null;

export const actionLabel = (k: NoticeKind): string | null =>
  k === 'booking' ? 'View request' : k === 'cancelled' ? 'View bookings' : k === 'review' ? 'See review'
    : k === 'payment' ? 'Open earnings' : null;

export type FilterKey = 'all' | 'unread' | 'booking' | 'review' | 'payment';
export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' }, { key: 'booking', label: 'Bookings' },
  { key: 'review', label: 'Reviews' }, { key: 'payment', label: 'Payments' },
];

type N = { type?: string | null; is_read?: boolean | null };
export function matchesFilter(n: N, f: FilterKey): boolean {
  if (f === 'all') return true;
  if (f === 'unread') return !n.is_read;
  const k = kindOf(n.type);
  return f === 'booking' ? k === 'booking' || k === 'cancelled' : k === f;
}

const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export function dayGroup(iso: string, now = new Date()): 'Today' | 'Yesterday' | 'Earlier' {
  const diff = Math.round((day0(now) - day0(new Date(iso))) / 86_400_000);
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : 'Earlier';
}

export function groupByDay<T extends { created_at: string }>(items: T[], now = new Date()) {
  const order = ['Today', 'Yesterday', 'Earlier'] as const;
  return order
    .map(label => ({ label, items: items.filter(i => dayGroup(i.created_at, now) === label) }))
    .filter(g => g.items.length > 0);
}

export function timeLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (dayGroup(iso, now) === 'Today') return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (dayGroup(iso, now) === 'Yesterday') return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
