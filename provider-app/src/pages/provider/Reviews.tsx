import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Star } from 'lucide-react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { REVIEW_FILTERS, applyFilter, shortName, summarize, type ReviewFilter, type ReviewSort } from '@/lib/reviewView';

type Review = {
  id: string; rating: number; comment: string | null; created_at: string;
  reviewer_name: string | null; service_name: string | null;
  bookings: { services: { name: string } | null } | null;
};

const SORTS: { key: ReviewSort; label: string }[] = [
  { key: 'latest', label: 'Latest' }, { key: 'highest', label: 'Highest' }, { key: 'lowest', label: 'Lowest' },
];

const Stars = ({ value, size = 'h-4 w-4' }: { value: number; size?: string }) => (
  <span className="flex gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(s => <Star key={s} className={cn(size, s <= Math.round(value) ? 'fill-gold text-gold' : 'text-border')} aria-hidden="true" />)}
  </span>
);

const Reviews = () => {
  const { provider } = useProvider();
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [sort, setSort] = useState<ReviewSort>('latest');

  const load = useCallback(async () => {
    if (!provider?.id) return;
    // Customer names come from reviews.reviewer_name: customers' profile rows are private to them.
    const { data, error } = await supabase.from('reviews')
      .select('id, rating, comment, created_at, reviewer_name, service_name, bookings(services(name))')
      .eq('provider_id', provider.id).order('created_at', { ascending: false });
    if (error) setFailed(true); else { setFailed(false); setRows((data ?? []) as unknown as Review[]); }
    setLoading(false);
  }, [provider?.id]);
  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarize(rows), [rows]);
  const list = useMemo(() => applyFilter(rows, filter, sort), [rows, filter, sort]);

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Reviews</h1>

      {loading ? (
        <div className="space-y-3"><div className="h-44 animate-pulse rounded-3xl bg-secondary" />{[0, 1].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-secondary" />)}</div>
      ) : failed ? (
        <div className="rounded-3xl bg-secondary p-8 text-center">
          <p className="font-bold">Couldn't load reviews</p>
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="press mt-4 h-11 rounded-xl bg-primary px-6 font-bold text-primary-foreground">Try again</button>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-[auto_1fr] items-center gap-5 rounded-3xl bg-primary p-5 text-primary-foreground">
            <div className="text-center">
              <p className="text-5xl font-extrabold text-gold">{summary.total ? summary.avg.toFixed(1) : '–'}</p>
              <div className="mt-1 flex justify-center"><Stars value={summary.avg} size="h-3.5 w-3.5" /></div>
              <p className="mt-1 text-xs opacity-70">{summary.total} {summary.total === 1 ? 'review' : 'reviews'}</p>
            </div>
            <div className="space-y-1.5" aria-label="Rating breakdown">
              {summary.bars.map(b => (
                <div key={b.star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-right font-bold">{b.star}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                    <motion.div className="h-full rounded-full bg-gold" initial={{ width: 0 }} animate={{ width: `${b.pct}%` }} transition={{ type: 'spring', damping: 24, stiffness: 120 }} />
                  </div>
                  <span className="w-5 tabular-nums opacity-70">{b.count}</span>
                </div>
              ))}
            </div>
          </section>

          {rows.length === 0 ? (
            <div className="rounded-3xl bg-secondary p-10 text-center">
              <Star className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-lg font-extrabold">No reviews yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Finish a job and ask the customer to rate you. Reviews appear here.</p>
            </div>
          ) : (
            <>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="tablist" aria-label="Filter reviews">
                {REVIEW_FILTERS.map(f => (
                  <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                    className={cn('press h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors',
                      filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>{f.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sort</span>
                {SORTS.map(s => (
                  <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}
                    className={cn('press rounded-full px-3 py-1 font-semibold', sort === s.key ? 'bg-gold/25 text-foreground' : 'text-muted-foreground')}>{s.label}</button>
                ))}
              </div>

              {list.length === 0 ? (
                <p className="rounded-2xl bg-secondary p-6 text-center text-sm text-muted-foreground">No reviews match this filter.</p>
              ) : list.map((r, i) => {
                const name = shortName(r.reviewer_name);
                return (
                  <motion.article key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', damping: 26, stiffness: 300, delay: Math.min(i, 6) * 0.04 }}
                    className="rounded-2xl bg-card p-4 ring-1 ring-border">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{name[0].toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold leading-tight">{name}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.bookings?.services?.name ?? r.service_name ?? 'Service'}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    <div className="mt-3"><Stars value={r.rating} /></div>
                    {r.comment?.trim() && (
                      <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{r.comment}</span>
                      </p>
                    )}
                  </motion.article>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Reviews;
