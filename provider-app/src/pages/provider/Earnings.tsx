import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowDownToLine, Wallet } from 'lucide-react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import LockedPage from '@/components/provider/LockedPage';
import CountUp from '@/components/CountUp';
import { groupByDay, inr, monthBuckets, statusText, totalsOf, type EarningRow } from '@/lib/earningsView';

type Earning = EarningRow & { id: string };
type Payout = { id: string; amount: number; status: string; requested_at: string };

const TABS = ['overview', 'activity', 'payouts'] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', activity: 'Activity', payouts: 'Payouts' };

const PILL: Record<string, string> = {
  pending: 'bg-gold/15 text-gold-foreground ring-1 ring-gold/40',
  processing: 'bg-primary text-primary-foreground',
  paid: 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30',
  failed: 'bg-red-500/10 text-red-600 ring-1 ring-red-500/30',
};
const buzz = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

const Earnings = () => {
  const { provider, refreshProvider } = useProvider();
  const navigate = useNavigate();
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [picked, setPicked] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!provider) return;
    const [e, p] = await Promise.all([
      supabase.from('provider_earnings').select('*').eq('provider_id', provider.id).order('created_at', { ascending: false }),
      supabase.from('payout_requests').select('*').eq('provider_id', provider.id).order('requested_at', { ascending: false }),
    ]);
    if (e.error || p.error) setFailed(true);
    else { setFailed(false); setEarnings((e.data ?? []) as unknown as Earning[]); setPayouts((p.data ?? []) as unknown as Payout[]); }
    setLoading(false);
  }, [provider]);

  useEffect(() => {
    if (!provider) return;
    void load();
    const ch = supabase.channel(`earnings-live-${provider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_earnings', filter: `provider_id=eq.${provider.id}` }, () => { void load(); void refreshProvider(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests', filter: `provider_id=eq.${provider.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [provider, load, refreshProvider]);

  const totals = useMemo(() => totalsOf(earnings), [earnings]);
  const months = useMemo(() => monthBuckets(earnings), [earnings]);
  const groups = useMemo(() => groupByDay(earnings), [earnings]);
  const maxMonth = Math.max(1, ...months.map(m => m.amount));

  const go = (dir: 1 | -1) => setTab(t => TABS[Math.min(TABS.length - 1, Math.max(0, TABS.indexOf(t) + dir))]);

  if (provider && provider.kyc_status !== 'approved') return <LockedPage pageName="Earnings" />;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-28 md:pb-6">
      {/* Balance: the one rich moment on this screen */}
      <motion.section
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[28px] bg-primary p-6 text-primary-foreground"
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gold/25 blur-3xl" />
        <p className="relative text-sm font-medium opacity-70">Earned from jobs</p>
        <p className="relative mt-1 text-[44px] font-extrabold leading-none tracking-tight">
          ₹<CountUp value={loading ? 0 : totals.available} />
        </p>
        <div className="relative mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-white/10 px-3 py-2.5"><p className="opacity-60">Processing</p><p className="font-bold">{inr(totals.processing)}</p></div>
          <div className="rounded-2xl bg-white/10 px-3 py-2.5"><p className="opacity-60">Paid out</p><p className="font-bold">{inr(totals.paid)}</p></div>
        </div>
        {totals.awaitingPayment > 0 && (
          <p className="relative mt-3 rounded-2xl bg-gold/15 px-3 py-2 text-xs font-semibold text-gold">
            {inr(totals.awaitingPayment)} from finished jobs is waiting for the customer to pay. It unlocks automatically.
          </p>
        )}
        {/* Money (balance, dues, withdrawals) is handled in the Wallet */}
        <button
          onClick={() => { buzz(8); navigate('/provider-panel/wallet'); }}
          className="press relative mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-base font-extrabold text-gold-foreground shadow-gold"
        >
          <Wallet className="h-5 w-5" /> Open Wallet to withdraw
        </button>
      </motion.section>

      {/* Segmented control with a sliding indicator */}
      <div className="relative grid grid-cols-3 rounded-full bg-secondary p-1" role="tablist">
        {TABS.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { buzz(6); setTab(t); }}
            className={cn('relative z-10 h-10 rounded-full text-sm font-semibold transition-colors', tab === t ? 'text-primary-foreground' : 'text-muted-foreground')}>
            {tab === t && <motion.span layoutId="earn-tab" transition={{ type: 'spring', stiffness: 460, damping: 36 }} className="absolute inset-0 -z-10 rounded-full bg-primary" />}
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-secondary" />)}</div>
      ) : failed ? (
        <div className="rounded-3xl bg-secondary p-8 text-center">
          <p className="font-bold">Couldn't load earnings</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <button onClick={() => { setLoading(true); void load(); }} className="press mt-4 h-11 rounded-xl bg-primary px-6 font-bold text-primary-foreground">Try again</button>
        </div>
      ) : (
        // Swipe left/right to change tab; vertical scroll stays native.
        <motion.div
          drag="x" dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={0.12} style={{ touchAction: 'pan-y' }}
          onDragEnd={(_, i) => { if (i.offset.x < -70 || i.velocity.x < -500) go(1); else if (i.offset.x > 70 || i.velocity.x > 500) go(-1); }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {tab === 'overview' && (
                <section className="rounded-3xl bg-secondary p-5">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-extrabold tracking-tight">Last 6 months</h2>
                    <p className="text-sm text-muted-foreground">{inr(totals.lifetime)} lifetime</p>
                  </div>
                  <div className="mt-6 flex h-44 items-end gap-3">
                    {months.map((m, i) => {
                      const sel = picked === i, h = Math.max(m.amount > 0 ? 8 : 3, (m.amount / maxMonth) * 100);
                      return (
                        <button key={`${m.y}-${m.m}`} onClick={() => { buzz(6); setPicked(sel ? null : i); }} aria-label={`${m.label}: ${inr(m.amount)}`} className="press flex h-full flex-1 flex-col items-center justify-end gap-2">
                          <span className={cn('text-[11px] font-bold transition-opacity', sel ? 'opacity-100' : 'opacity-0')}>{inr(m.amount)}</span>
                          <motion.span initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ type: 'spring', damping: 22, stiffness: 160, delay: i * 0.04 }}
                            className={cn('w-full rounded-xl', sel || (picked === null && m.isCurrent) ? 'bg-gold' : 'bg-primary/15')} />
                          <span className="text-xs font-semibold text-muted-foreground">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {tab === 'activity' && (groups.length === 0 ? (
                <div className="rounded-3xl bg-secondary p-10 text-center"><p className="text-lg font-extrabold">No earnings yet</p><p className="mt-1 text-sm text-muted-foreground">Finish a job and it shows up here.</p></div>
              ) : (
                <div className="space-y-5">
                  {groups.map(g => (
                    <div key={g.key}>
                      <div className="mb-2 flex items-baseline justify-between px-1"><h3 className="text-sm font-bold">{g.label}</h3><span className="text-sm text-muted-foreground">{inr(g.total)}</span></div>
                      <div className="divide-y divide-border overflow-hidden rounded-3xl bg-secondary">
                        {g.items.map(e => (
                          <div key={e.id} className="flex items-center gap-3 px-4 py-3.5">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background"><ArrowDownToLine className="h-5 w-5" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold">Job payment</p>
                              <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-extrabold">+{inr(Number(e.provider_amount))}</p>
                              <span className={cn('mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold', PILL[e.status] ?? PILL.pending)}>{statusText(e.status)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {tab === 'payouts' && (payouts.length === 0 ? (
                <div className="rounded-3xl bg-secondary p-10 text-center"><p className="text-lg font-extrabold">No payouts yet</p><p className="mt-1 text-sm text-muted-foreground">Withdrawals you request will be tracked here.</p></div>
              ) : (
                <div className="divide-y divide-border overflow-hidden rounded-3xl bg-secondary">
                  {payouts.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-4">
                      <div><p className="text-lg font-extrabold">{inr(Number(p.amount))}</p><p className="text-xs text-muted-foreground">{new Date(p.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', PILL[p.status] ?? PILL.pending)}>{statusText(p.status)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export default Earnings;