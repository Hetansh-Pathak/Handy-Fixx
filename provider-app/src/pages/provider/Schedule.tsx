import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Copy, Plus, Trash2 } from 'lucide-react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import LockedPage from '@/components/provider/LockedPage';
import { cn } from '@/lib/utils';
import {
  DAYS, DAY_LONG, DAY_SHORT, PRESETS, WEEKDAYS, dayKey, formatTime, nextFreeRange, norm, summarizeDay,
  todayISO, toMin, validateRange, weekTotals, type Day, type RangeRow,
} from '@/lib/scheduleView';

type Slot = RangeRow & { day_of_week: string };
type TodayJob = { id: string; status: string; scheduled_time: string | null; booking_time: string | null; services: { name: string } | null };

const Schedule = () => {
  const { provider } = useProvider();
  const { toast } = useToast();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [jobs, setJobs] = useState<TodayJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [day, setDay] = useState<Day>(dayKey());
  const [draft, setDraft] = useState<Record<string, { start: string; end: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const loadSlots = useCallback(async () => {
    if (!provider?.id) return;
    const { data, error } = await supabase.from('provider_availability').select('id, day_of_week, start_time, end_time, is_available')
      .eq('provider_id', provider.id).order('start_time');
    if (error) setFailed(true);
    else { setFailed(false); setSlots(((data ?? []) as Slot[]).map(s => ({ ...s, start_time: norm(s.start_time), end_time: norm(s.end_time) }))); }
    setLoading(false);
  }, [provider?.id]);

  const loadJobs = useCallback(async () => {
    if (!provider?.id) return;
    const today = todayISO(); // local date: toISOString() gives the wrong day before 5:30 AM IST
    const { data } = await supabase.from('bookings').select('id, status, scheduled_time, booking_time, services(name)')
      .eq('provider_id', provider.id).in('status', ['confirmed', 'on_the_way', 'in_progress'])
      .or(`scheduled_date.eq.${today},booking_date.eq.${today}`);
    setJobs(((data ?? []) as unknown as TodayJob[]).sort((a, b) => toMin(a.scheduled_time || a.booking_time) - toMin(b.scheduled_time || b.booking_time)));
  }, [provider?.id]);

  useEffect(() => {
    if (!provider?.id) return;
    void loadSlots(); void loadJobs();
    const ch = supabase.channel(`provider-schedule-${provider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${provider.id}` }, () => void loadJobs())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [provider?.id, loadSlots, loadJobs]);

  const daySlots = useMemo(() => slots.filter(s => s.day_of_week === day).sort((a, b) => toMin(a.start_time) - toMin(b.start_time)), [slots, day]);
  const totals = useMemo(() => weekTotals(slots), [slots]);
  const fail = (msg: string) => toast({ title: 'Could not save', description: msg, variant: 'destructive' });

  const addRange = async (start: string, end: string) => {
    if (!provider?.id || busy) return;
    const err = validateRange(start, end, daySlots);
    if (err) return fail(err);
    setBusy(true);
    const { error } = await supabase.from('provider_availability').insert({ provider_id: provider.id, day_of_week: day, start_time: start, end_time: end, is_available: true });
    setBusy(false);
    if (error) fail(error.message); else void loadSlots();
  };

  const patch = async (id: string, values: Record<string, string | boolean>) => {
    const { error } = await supabase.from('provider_availability').update(values).eq('id', id);
    if (error) fail(error.message);
    void loadSlots();
  };

  const commitTimes = async (s: Slot) => {
    const d = draft[s.id];
    if (!d) return;
    if (d.start === s.start_time && d.end === s.end_time) { setDraft(({ [s.id]: _, ...rest }) => rest); return; }
    const err = validateRange(d.start, d.end, daySlots.filter(o => o.id !== s.id));
    if (err) { setErrors(e => ({ ...e, [s.id]: err })); return; }
    setErrors(({ [s.id]: _, ...rest }) => rest);
    setDraft(({ [s.id]: _, ...rest }) => rest);
    await patch(s.id, { start_time: d.start, end_time: d.end });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('provider_availability').delete().eq('id', id);
    if (error) fail(error.message);
    void loadSlots();
  };

  /** Insert the new rows first, then delete the old ones, so a failure never leaves a day empty. */
  const copyTo = async (targets: Day[], label: string) => {
    if (!provider?.id || busy) return;
    const source = daySlots.filter(s => s.is_available);
    if (!source.length) return toast({ title: 'Nothing to copy', description: `Add hours on ${DAY_LONG[day]} first.`, variant: 'destructive' });
    const days = targets.filter(d => d !== day);
    setBusy(true);
    const oldIds = slots.filter(s => days.includes(s.day_of_week as Day)).map(s => s.id);
    const rows = days.flatMap(d => source.map(s => ({ provider_id: provider.id, day_of_week: d, start_time: s.start_time, end_time: s.end_time, is_available: true })));
    const ins = await supabase.from('provider_availability').insert(rows);
    if (ins.error) { setBusy(false); return fail(ins.error.message); }
    if (oldIds.length) {
      const del = await supabase.from('provider_availability').delete().in('id', oldIds);
      if (del.error) toast({ title: 'Copied, but old hours remain', description: 'Some days may show extra ranges. Remove them by hand.', variant: 'destructive' });
    }
    setBusy(false);
    await loadSlots();
    toast({ title: `Copied to ${label}` });
  };

  if (provider && provider.kyc_status !== 'approved') return <LockedPage pageName="Schedule" />;
  const free = nextFreeRange(daySlots);

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground">
          {slots.length ? `Open ${totals.days} ${totals.days === 1 ? 'day' : 'days'} · ${totals.hours} h a week` : 'Set the hours customers can book you'}
        </p>
      </div>

      {jobs.length > 0 && (
        <section className="rounded-3xl bg-primary p-4 text-primary-foreground" aria-label="Today's jobs">
          <p className="flex items-center gap-2 text-sm font-bold"><Clock className="h-4 w-4 text-gold" aria-hidden="true" /> Today · {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</p>
          <ul className="mt-3 space-y-2">
            {jobs.map(j => (
              <li key={j.id} className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2.5 text-sm">
                <span className="font-semibold">{j.services?.name ?? 'Service'}</span>
                <span className="text-gold">{j.scheduled_time || j.booking_time ? formatTime(j.scheduled_time || j.booking_time) : 'Time TBD'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="tablist" aria-label="Day of week">
        {DAYS.map(d => {
          const on = slots.some(s => s.day_of_week === d && s.is_available);
          return (
            <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => setDay(d)}
              className={cn('press relative flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-xs font-bold transition-colors',
                day === d ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
              {DAY_SHORT[d]}
              <span className={cn('mt-1 h-1.5 w-1.5 rounded-full', on ? 'bg-gold' : 'bg-transparent')} aria-label={on ? 'Open' : undefined} />
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />)}</div>
      ) : failed ? (
        <div className="rounded-3xl bg-secondary p-8 text-center">
          <p className="font-bold">Couldn't load your schedule</p>
          <button type="button" onClick={() => { setLoading(true); void loadSlots(); }} className="press mt-4 h-11 rounded-xl bg-primary px-6 font-bold text-primary-foreground">Try again</button>
        </div>
      ) : (
        <section aria-label={`${DAY_LONG[day]} hours`} className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold">{DAY_LONG[day]}</h2>
            <p className="text-xs text-muted-foreground">{summarizeDay(daySlots)}</p>
          </div>

          <AnimatePresence initial={false}>
            {daySlots.map(s => {
              const d = draft[s.id] ?? { start: s.start_time, end: s.end_time };
              const timeCls = 'h-11 w-full rounded-xl bg-secondary px-3 text-center text-sm font-bold outline-none focus:ring-2 focus:ring-gold';
              return (
                <motion.div key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }}
                  className={cn('rounded-2xl bg-card p-3 ring-1', errors[s.id] ? 'ring-red-500/50' : 'ring-border')}>
                  <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2">
                    <Switch checked={!!s.is_available} onCheckedChange={v => void patch(s.id, { is_available: v })} aria-label="Available in this range" />
                    <input type="time" aria-label="Start time" value={d.start} className={timeCls}
                      onChange={e => setDraft(x => ({ ...x, [s.id]: { ...d, start: e.target.value } }))} onBlur={() => void commitTimes(s)} />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input type="time" aria-label="End time" value={d.end} className={timeCls}
                      onChange={e => setDraft(x => ({ ...x, [s.id]: { ...d, end: e.target.value } }))} onBlur={() => void commitTimes(s)} />
                    <button type="button" onClick={() => void remove(s.id)} aria-label="Remove this range"
                      className="press flex h-11 w-11 items-center justify-center rounded-xl text-red-600 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {errors[s.id] && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{errors[s.id]} Not saved.</p>}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {daySlots.length === 0 && <p className="rounded-2xl bg-secondary p-5 text-center text-sm text-muted-foreground">Day off. Customers can't book you on {DAY_LONG[day]}.</p>}

          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} type="button" disabled={busy || !!validateRange(p.start, p.end, daySlots)} onClick={() => void addRange(p.start, p.end)}
                className="press h-10 rounded-full bg-secondary px-4 text-sm font-semibold disabled:opacity-40">{p.label} · {formatTime(p.start)}</button>
            ))}
          </div>
          <button type="button" disabled={busy || !free} onClick={() => free && void addRange(free.start_time, free.end_time)}
            className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-base font-extrabold text-gold-foreground disabled:opacity-50">
            <Plus className="h-5 w-5" aria-hidden="true" /> {free ? 'Add hours' : 'Day is full'}
          </button>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button type="button" disabled={busy} onClick={() => void copyTo(WEEKDAYS, 'weekdays')} className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-semibold disabled:opacity-50"><Copy className="h-4 w-4" aria-hidden="true" /> Copy to Mon–Fri</button>
            <button type="button" disabled={busy} onClick={() => void copyTo([...DAYS], 'all days')} className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-semibold disabled:opacity-50"><Copy className="h-4 w-4" aria-hidden="true" /> Copy to all days</button>
          </div>
        </section>
      )}
    </div>
  );
};

export default Schedule;
