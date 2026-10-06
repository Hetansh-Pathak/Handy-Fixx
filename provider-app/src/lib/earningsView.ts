/** Pure money/date helpers for provider Dashboard + Earnings (unit tested). All day maths is LOCAL time. */
export type EarningRow = { id?: string; provider_amount: number | string; status: string; created_at: string; payable?: boolean | null };

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function totalsOf(rows: EarningRow[]) {
  const add = (list: EarningRow[]) => list.reduce((a, r) => a + Number(r.provider_amount || 0), 0);
  const sum = (s?: string) => add(rows.filter(r => !s || r.status === s));
  // A pending row is only withdrawable once the customer has paid (payable). Rows with no flag (old data) count as payable.
  const pending = rows.filter(r => r.status === 'pending');
  return {
    lifetime: sum(),
    available: add(pending.filter(r => r.payable !== false)),
    awaitingPayment: add(pending.filter(r => r.payable === false)),
    processing: sum('processing'),
    paid: sum('paid'),
  };
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Last 7 local days, oldest first, today last. */
export function weekBuckets(rows: Pick<EarningRow, 'provider_amount' | 'created_at'>[], now = new Date()) {
  const today = startOfDay(now);
  const out = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i));
    return { key: dayKey(d), label: DOW[d.getDay()], amount: 0, isToday: i === 6 };
  });
  const byKey = new Map(out.map(b => [b.key, b]));
  rows.forEach(r => { const b = byKey.get(dayKey(new Date(r.created_at))); if (b) b.amount += Number(r.provider_amount || 0); });
  return out;
}

/** Last n calendar months. Built from day 1 so a 31st can't skip a month (setMonth bug). */
export function monthBuckets(rows: Pick<EarningRow, 'provider_amount' | 'created_at'>[], now = new Date(), n = 6) {
  const out = Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleString('en-IN', { month: 'short' }), amount: 0, isCurrent: i === n - 1 };
  });
  rows.forEach(r => {
    const d = new Date(r.created_at);
    const b = out.find(x => x.y === d.getFullYear() && x.m === d.getMonth());
    if (b) b.amount += Number(r.provider_amount || 0);
  });
  return out;
}

export function dayLabel(d: Date, now = new Date()) {
  const diff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function groupByDay<T extends { created_at: string; provider_amount?: number | string }>(rows: T[], now = new Date()) {
  const groups: { key: string; label: string; total: number; items: T[] }[] = [];
  [...rows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).forEach(r => {
    const d = new Date(r.created_at), k = dayKey(d);
    let g = groups.find(x => x.key === k);
    if (!g) { g = { key: k, label: dayLabel(d, now), total: 0, items: [] }; groups.push(g); }
    g.items.push(r); g.total += Number(r.provider_amount || 0);
  });
  return groups;
}

export const greeting = (hour: number) => (hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Working late');

export const statusText = (s: string) => ({ pending: 'Ready to withdraw', processing: 'Processing', paid: 'Paid', failed: 'Failed' } as Record<string, string>)[s] ?? s;
