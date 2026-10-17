import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Briefcase, CheckCheck, ChevronRight, IndianRupee, Star, XCircle, type LucideIcon } from 'lucide-react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  FILTERS, actionLabel, groupByDay, kindOf, matchesFilter, routeOfKind, timeLabel, toneOfKind,
  type FilterKey, type NoticeKind, type NoticeTone,
} from '@/lib/notificationView';

type Notice = { id: string; type: string; title: string; message: string | null; is_read: boolean | null; created_at: string };

const ICON: Record<NoticeKind, LucideIcon> = { booking: Briefcase, cancelled: XCircle, review: Star, payment: IndianRupee, other: Bell };
const TONE: Record<NoticeTone, string> = {
  gold: 'bg-gold/20 text-gold-foreground',
  black: 'bg-primary text-primary-foreground',
  green: 'bg-emerald-500/15 text-emerald-700',
  red: 'bg-red-500/10 text-red-600',
};

const Notifications = () => {
  const { provider, refreshUnreadCount } = useProvider();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(async () => {
    if (!provider?.id) return;
    const { data, error } = await supabase.from('provider_notifications')
      .select('id, type, title, message, is_read, created_at')
      .eq('provider_id', provider.id).order('created_at', { ascending: false }).limit(200);
    if (error) setFailed(true); else { setFailed(false); setItems((data ?? []) as Notice[]); }
    setLoading(false);
  }, [provider?.id]);

  useEffect(() => {
    if (!provider?.id) return;
    void load();
    const ch = supabase.channel(`provider-notices-${provider.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'provider_notifications', filter: `provider_id=eq.${provider.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [provider?.id, load]);

  const unread = useMemo(() => items.filter(n => !n.is_read).length, [items]);
  const groups = useMemo(() => groupByDay(items.filter(n => matchesFilter(n, filter))), [items, filter]);

  const open = async (n: Notice) => {
    const route = routeOfKind(kindOf(n.type));
    if (!n.is_read) {
      setItems(cur => cur.map(x => x.id === n.id ? { ...x, is_read: true } : x)); // optimistic
      const { error } = await supabase.from('provider_notifications').update({ is_read: true }).eq('id', n.id);
      if (error) { setItems(cur => cur.map(x => x.id === n.id ? { ...x, is_read: false } : x)); toast({ title: 'Could not mark as read', variant: 'destructive' }); }
      else refreshUnreadCount();
    }
    if (route) navigate(route);
  };

  const markAll = async () => {
    if (!provider?.id || unread === 0) return;
    const before = items;
    setItems(cur => cur.map(x => ({ ...x, is_read: true })));
    const { error } = await supabase.from('provider_notifications').update({ is_read: true }).eq('provider_id', provider.id).eq('is_read', false);
    if (error) { setItems(before); toast({ title: 'Could not update', description: 'Please try again.', variant: 'destructive' }); }
    else { refreshUnreadCount(); toast({ title: 'All caught up' }); }
  };

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted-foreground">{unread > 0 ? `${unread} unread` : 'You are all caught up'}</p>
        </div>
        <button type="button" onClick={markAll} disabled={unread === 0}
          className="press flex h-10 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-semibold disabled:opacity-40">
          <CheckCheck className="h-4 w-4" aria-hidden="true" /> Mark all read
        </button>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="tablist" aria-label="Filter alerts">
        {FILTERS.map(f => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
            className={cn('press h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors',
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-secondary" />)}</div>
      ) : failed ? (
        <div className="rounded-3xl bg-secondary p-8 text-center">
          <p className="font-bold">Couldn't load alerts</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="press mt-4 h-11 rounded-xl bg-primary px-6 font-bold text-primary-foreground">Try again</button>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-3xl bg-secondary p-10 text-center">
          <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-lg font-extrabold">{filter === 'unread' ? 'Nothing unread' : 'No alerts yet'}</p>
          <p className="mt-1 text-sm text-muted-foreground">New requests, reviews and payouts will show up here.</p>
        </div>
      ) : (
        groups.map(g => (
          <section key={g.label} aria-label={g.label} className="space-y-2">
            <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
            <AnimatePresence initial={false}>
              {g.items.map((n, i) => {
                const kind = kindOf(n.type);
                const Icon = ICON[kind];
                const label = actionLabel(kind);
                return (
                  <motion.button key={n.id} type="button" layout onClick={() => void open(n)}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', damping: 26, stiffness: 300, delay: Math.min(i, 6) * 0.03 }}
                    className={cn('press flex w-full items-start gap-3 rounded-2xl p-4 text-left ring-1 ring-border',
                      n.is_read ? 'bg-card' : 'bg-card shadow-sm ring-gold/50')}>
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', TONE[toneOfKind(kind)])}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={cn('text-sm leading-snug', n.is_read ? 'font-semibold' : 'font-extrabold')}>{n.title}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel(n.created_at)}</span>
                      </span>
                      {n.message && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.message}</span>}
                      {label && <span className="mt-1.5 flex items-center gap-0.5 text-xs font-bold">{label}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>}
                    </span>
                    {!n.is_read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </section>
        ))
      )}
    </div>
  );
};

export default Notifications;
