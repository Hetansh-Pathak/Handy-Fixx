import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Loader2, RefreshCw } from 'lucide-react';
import {
  flaggedProviders, minutesWaiting, pendingWatchCutoff, summariseProviderActivity, PENDING_WATCH_MINUTES,
  type ActivityRow, type ProviderActivity, type ProviderFlag,
} from '@handyfix/shared';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn, shortId } from '@/lib/utils';

type Waiting = {
  id: string; created_at: string; city: string | null; customer_name: string | null;
  service_providers: { full_name: string | null; phone: string | null } | null;
  services: { name: string } | null;
};
type Flagged = { activity: ProviderActivity; flags: ProviderFlag[]; name: string; phone: string | null };

const WINDOW_DAYS = 90;
const PAGE = 1000;
const MAX_PAGES = 5;

const waitLabel = (m: number | null) => {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} days`;
};

/** Pending requests nobody answered for 15 minutes, and pros whose record deserves a look (PDF p.9, p.11, p.12). Read-only. */
const AdminWatchlist: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [flagged, setFlagged] = useState<Flagged[]>([]);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const { data: pending, error: pendingError } = await supabase
        .from('bookings')
        .select('id, created_at, city, customer_name, service_providers:provider_id (full_name, phone), services:service_id (name)')
        .eq('status', 'pending')
        .lt('created_at', pendingWatchCutoff(now))
        .order('created_at', { ascending: true })
        .limit(100);
      if (pendingError) throw pendingError;
      setWaiting((pending ?? []) as unknown as Waiting[]);

      const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
      const rows: ActivityRow[] = [];
      let cut = false;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data, error } = await supabase
          .from('bookings')
          .select('provider_id, status, cancellation_reason, updated_at')
          .gte('created_at', since)
          .not('provider_id', 'is', null)
          .order('created_at', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as ActivityRow[]));
        if ((data ?? []).length < PAGE) break;
        if (page === MAX_PAGES - 1) cut = true;
      }
      setTruncated(cut);

      const flaggedList = flaggedProviders(summariseProviderActivity(rows, now));
      const ids = flaggedList.map((f) => f.activity.providerId);
      const names = new Map<string, { name: string; phone: string | null }>();
      if (ids.length) {
        const { data: pros, error } = await supabase.from('service_providers').select('id, full_name, phone').in('id', ids);
        if (error) throw error;
        for (const p of pros ?? []) names.set(p.id, { name: p.full_name ?? 'Provider', phone: p.phone ?? null });
      }
      setFlagged(flaggedList.map((f) => ({ ...f, name: names.get(f.activity.providerId)?.name ?? 'Provider', phone: names.get(f.activity.providerId)?.phone ?? null })));
    } catch (e) {
      toast({ title: 'Could not load the watchlist', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Watchlist</h1>
          <p className="text-sm text-muted-foreground">Requests nobody has answered, and pros whose record deserves a look. Nothing here changes data.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Refresh
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4" /> Pending for {PENDING_WATCH_MINUTES}+ minutes ({waiting.length})</h2>
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">No request is waiting too long.</p>
        ) : (
          <Card className="divide-y">
            {waiting.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{w.services?.name ?? 'Service'} · {w.city ?? '—'} <span className="font-mono text-xs text-muted-foreground">{shortId(w.id)}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {w.customer_name ?? 'Customer'} → {w.service_providers?.full_name ?? 'no pro'}{w.service_providers?.phone ? ` · ${w.service_providers.phone}` : ''}
                  </p>
                </div>
                <Badge className="bg-amber-500/15 text-amber-600">Waiting {waitLabel(minutesWaiting(w.created_at, new Date()))}</Badge>
              </div>
            ))}
            <div className="px-4 py-2 text-xs text-muted-foreground">
              To help: call the pro, or open <Link className="text-primary underline" to="/bookings">Bookings</Link> and reassign the request (pending and confirmed bookings can be reassigned).
            </div>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" /> Pros to look at ({flagged.length})</h2>
        <p className="text-xs text-muted-foreground">
          Last {WINDOW_DAYS} days. A flag is a signal, not a verdict: check the jobs before acting. Open <Link className="text-primary underline" to="/providers">Providers</Link> to message, warn or suspend.
          {truncated ? ' Showing the newest ' + (PAGE * MAX_PAGES).toLocaleString('en-IN') + ' bookings only.' : ''}
        </p>
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : flagged.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pro is flagged right now.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {flagged.map((f) => (
              <Card key={f.activity.providerId} className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{f.name}</p>
                  <span className="font-mono text-xs text-muted-foreground">{shortId(f.activity.providerId)}</span>
                </div>
                {f.phone ? <p className="text-xs text-muted-foreground">{f.phone}</p> : null}
                <ul className="space-y-1">
                  {f.flags.map((flag) => (
                    <li key={flag.code} className={cn('text-xs', flag.severity === 'high' ? 'text-red-600' : 'text-amber-600')}>{flag.message}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {f.activity.requests} requests · {f.activity.completed} completed · {f.activity.declined} declined · {f.activity.abandoned} not finished
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminWatchlist;
