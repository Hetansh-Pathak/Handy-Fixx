/** Pure helpers for the provider Reviews screen (unit tested). */
export type ReviewRow = { id: string; rating: number; comment?: string | null; created_at: string };
export type ReviewFilter = 'all' | '5' | '4' | 'low' | 'comments';
export type ReviewSort = 'latest' | 'highest' | 'lowest';

export const REVIEW_FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: '5', label: '5★' }, { key: '4', label: '4★' },
  { key: 'low', label: '3★ & below' }, { key: 'comments', label: 'With comments' },
];

/** Average + per-star counts computed from the loaded reviews (the stored provider.rating can lag). */
export function summarize(rows: Pick<ReviewRow, 'rating'>[]) {
  const total = rows.length;
  const avg = total ? rows.reduce((s, r) => s + Number(r.rating), 0) / total : 0;
  const bars = [5, 4, 3, 2, 1].map(star => {
    const count = rows.filter(r => Math.round(Number(r.rating)) === star).length;
    return { star, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
  return { total, avg, bars };
}

export function applyFilter<T extends ReviewRow>(rows: T[], f: ReviewFilter, s: ReviewSort): T[] {
  const out = rows.filter(r =>
    f === 'all' ? true : f === '5' ? r.rating === 5 : f === '4' ? r.rating === 4
      : f === 'low' ? r.rating <= 3 : !!r.comment?.trim());
  const t = (r: T) => new Date(r.created_at).getTime();
  return out.sort((a, b) => s === 'highest' ? b.rating - a.rating || t(b) - t(a)
    : s === 'lowest' ? a.rating - b.rating || t(b) - t(a) : t(b) - t(a));
}

/** "Priya S." - first name plus last initial, so providers don't get a customer's full name. */
export function shortName(full?: string | null): string {
  if ((full ?? '').includes('@')) return 'Customer'; // older reviews stored the email as the name
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
