import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Star, Briefcase, TrendingUp, Clock, MapPin, CheckCircle2, Power, Wallet } from 'lucide-react';
import LockedPage from '@/components/provider/LockedPage';
import CountUp from '@/components/CountUp';
import { greeting, inr, weekBuckets } from '@/lib/earningsView';
import { whenLabel } from '@/lib/bookingView';
import { cn } from '@/lib/utils';

type PendingRow = {
  id: string; total_amount: number | null; address: string | null; city: string | null;
  scheduled_date: string | null; scheduled_time: string | null; booking_date: string | null; booking_time: string | null;
  services: { name: string } | null;
};

const Dashboard: React.FC = () => {
  const { provider, toggleOnline } = useProvider();
  const navigate = useNavigate();
  const [weekRows, setWeekRows] = useState<{ provider_amount: number; created_at: string }[]>([]);
  const [pendingBookings, setPendingBookings] = useState<PendingRow[]>([]);
  const [picked, setPicked] = useState<number | null>(null);

  // One query for the whole week (was 7 sequential queries), from LOCAL midnight (was UTC, wrong in IST).
  const fetchWeek = useCallback(async () => {
    if (!provider) return;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const { data } = await supabase.from('provider_earnings').select('provider_amount, created_at')
      .eq('provider_id', provider.id).gte('created_at', from.toISOString());
    setWeekRows((data ?? []) as { provider_amount: number; created_at: string }[]);
  }, [provider]);

  const fetchPending = useCallback(async () => {
    if (!provider) return;
    const { data } = await (supabase as any).from('bookings')
      .select('id, total_amount, address, city, scheduled_date, scheduled_time, booking_date, booking_time, services(name)')
      .eq('provider_id', provider.id).eq('status', 'pending').order('created_at', { ascending: true }).limit(5);
    setPendingBookings((data ?? []) as PendingRow[]);
  }, [provider]);

  useEffect(() => { void fetchWeek(); void fetchPending(); }, [fetchWeek, fetchPending]);

  useEffect(() => {
    if (!provider) return;
    const channel = supabase.channel(`dashboard-live-${provider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${provider.id}` }, () => void fetchPending())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_earnings', filter: `provider_id=eq.${provider.id}` }, () => void fetchWeek())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [provider, fetchPending, fetchWeek]);

  const week = useMemo(() => weekBuckets(weekRows), [weekRows]);
  const todayEarn = week[6]?.amount ?? 0;
  const weekTotal = week.reduce((s, d) => s + d.amount, 0);
  const maxDay = Math.max(1, ...week.map(d => d.amount));

  const stats = [
    { label: 'Rating', value: Number(provider?.rating || 0).toFixed(1), icon: Star },
    { label: 'Total jobs', value: String(provider?.total_jobs || 0), icon: Briefcase },
    { label: 'Acceptance', value: `${Number(provider?.acceptance_rate ?? 100).toFixed(0)}%`, icon: TrendingUp },
  ];

  if (provider && provider.kyc_status !== 'approved') {
    return <LockedPage pageName="Dashboard" />;
  }

  const online = Boolean(provider?.is_online);
  const first = provider?.full_name?.split(' ')[0] ?? '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Online hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`rounded-[28px] p-6 transition-colors duration-500 ${online ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium opacity-70">{greeting(new Date().getHours())}{first ? `, ${first}` : ''}</p>
          {provider?.is_email_verified && <CheckCircle2 className="h-4 w-4 text-gold" aria-label="Verified Provider" />}
        </div>
        <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight">{online ? "You're online" : "You're offline"}</h1>
        <p className="mt-1 text-sm opacity-70">{online ? 'New requests will appear here with a sound.' : 'Go online to start receiving jobs.'}</p>

        <button
          onClick={toggleOnline}
          aria-pressed={online}
          className={`press relative mt-6 flex h-16 w-full items-center rounded-full p-1.5 transition-colors duration-300 ${online ? 'bg-white/15' : 'bg-foreground/10'}`}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={`flex h-[52px] w-[52px] items-center justify-center rounded-full ${online ? 'ml-auto bg-gold text-gold-foreground shadow-gold' : 'bg-background'}`}
          >
            <Power className="h-6 w-6" />
          </motion.span>
          <span className={`absolute inset-0 flex items-center text-sm font-bold ${online ? 'pl-6' : 'justify-end pr-6'}`}>
            {online ? 'Go offline' : 'Go online'}
          </span>
        </button>
      </motion.div>

      {/* Today */}
      <motion.button
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.35 }}
        onClick={() => navigate('/provider-panel/earnings')}
        className="press flex w-full items-center justify-between rounded-3xl bg-secondary p-5 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-muted-foreground">Earned today</span>
          <span className="mt-1 block text-[34px] font-extrabold leading-none tracking-tight">₹<CountUp value={todayEarn} /></span>
        </span>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold text-gold-foreground"><Wallet className="h-6 w-6" /></span>
      </motion.button>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 + i * 0.05, duration: 0.35 }} className="rounded-3xl bg-secondary p-4">
            <stat.icon className="mb-3 h-4 w-4 text-muted-foreground" />
            <p className="text-xl font-extrabold">{stat.value}</p>
            <p className="text-xs font-semibold text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Pending requests */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold tracking-tight">Pending requests</h2>
          {pendingBookings.length > 0 && <button onClick={() => navigate('/provider-panel/bookings')} className="press text-sm font-semibold text-muted-foreground">View all</button>}
        </div>
        {pendingBookings.length === 0 ? (
          <div className="rounded-3xl bg-secondary py-10 text-center">
            <p className="font-bold">{online ? 'All caught up' : 'You are offline'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{online ? 'New requests appear here the moment they arrive.' : 'Go online to start getting requests.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingBookings.map((b, i) => (
              <motion.button
                key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}
                onClick={() => navigate('/provider-panel/bookings')}
                className="press flex w-full items-center gap-3 rounded-3xl bg-card p-4 text-left ring-1 ring-border"
              >
                <span className="h-12 w-1.5 shrink-0 rounded-full bg-gold" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{b.services?.name || 'Service'}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{whenLabel(b.scheduled_date || b.booking_date, b.scheduled_time || b.booking_time)}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /><span className="truncate">{b.address || b.city || 'No address'}</span></p>
                </div>
                <p className="text-lg font-extrabold">{inr(Number(b.total_amount || 0))}</p>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      {/* This week: tap a day to see its amount */}
      <section className="rounded-3xl bg-secondary p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold tracking-tight">This week</h2>
          <p className="text-sm text-muted-foreground">{inr(weekTotal)}</p>
        </div>
        <div className="mt-5 flex h-36 items-end gap-2.5">
          {week.map((d, i) => {
            const sel = picked === i, h = Math.max(d.amount > 0 ? 8 : 3, (d.amount / maxDay) * 100);
            return (
              <button key={d.key} onClick={() => { try { navigator.vibrate?.(6); } catch { /* noop */ } setPicked(sel ? null : i); }} aria-label={`${d.label}: ${inr(d.amount)}`} className="press flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className={cn('text-[10px] font-bold transition-opacity', sel ? 'opacity-100' : 'opacity-0')}>{inr(d.amount)}</span>
                <motion.span initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ type: 'spring', damping: 22, stiffness: 160, delay: i * 0.03 }}
                  className={cn('w-full rounded-lg', sel || (picked === null && d.isToday) ? 'bg-gold' : 'bg-primary/15')} />
                <span className={cn('text-[11px] font-semibold', d.isToday ? 'text-foreground' : 'text-muted-foreground')}>{d.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
