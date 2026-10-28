import React, { useCallback, useEffect, useState } from 'react';
import { Gavel, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const sb = supabase as any;
const inr = (n: number | string | null | undefined) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN') : '—');

type Dispute = {
  id: string; booking_id: string; category: string; details: string; status: string; outcome: string | null;
  provider_reply: string | null; replied_at: string | null; decision_note: string | null; appealed_by: string | null;
  appeal_note: string | null; created_at: string; provider_name: string | null; customer_name: string | null;
  service_name: string | null; total_amount: number | null; timeline: Record<string, unknown>;
};
type FeeRow = { booking_id: string; provider_name: string | null; service_bill: number; slab_fee: number; charged: number; waived: number; refunded: number; created_at: string };
type Overview = { charged_total: number; charged_month: number; waived_total: number; refunded_total: number; jobs: number; open_disputes: number; recent: FeeRow[] };

const OUTCOMES = [
  { value: 'dismissed', label: 'Dismissed', desc: 'The work was fine.' },
  { value: 'redo', label: 'Redo', desc: 'Pro returns free within 7 days.' },
  { value: 'partial_refund', label: 'Partial refund', desc: 'Settled at an adjusted amount. Fee is returned to the pro.' },
  { value: 'provider_penalty', label: 'Provider penalty', desc: 'Warning, ranking drop or suspension.' },
] as const;

const TIMELINE_LABEL: Record<string, string> = {
  booked_at: 'Booked', price_locked_at: 'Price locked', departed_at: 'Trip started', arrived_at: 'Arrived',
  started_at: 'Job started', completed_at: 'Code entered',
};

const AdminDisputes: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [active, setActive] = useState<Dispute | null>(null);
  const [outcome, setOutcome] = useState<string>('dismissed');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, o] = await Promise.all([sb.rpc('admin_list_booking_disputes'), sb.rpc('admin_fee_overview')]);
    const err = d.error ?? o.error ?? (d.data?.success === false ? { message: d.data.error } : null);
    if (err) toast({ title: 'Could not load', description: err.message, variant: 'destructive' });
    setDisputes((d.data?.disputes ?? []) as Dispute[]);
    setOverview(o.data?.success ? (o.data as Overview) : null);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const decide = async () => {
    if (!active) return;
    setBusy(true);
    const { data, error } = await sb.rpc('admin_decide_dispute', { p_dispute_id: active.id, p_outcome: outcome, p_note: note });
    setBusy(false);
    if (error || !data?.success) {
      toast({ title: 'Not saved', description: error?.message ?? data?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Decision saved', description: 'Both sides were notified. Logged in the audit log.' });
    setActive(null);
    setNote('');
    void load();
  };

  const open = disputes.filter((d) => d.status === 'open' || d.status === 'appealed');
  const closed = disputes.filter((d) => d.status === 'decided' || d.status === 'closed');

  const list = (rows: Dispute[]) => rows.length === 0 ? (
    <Card className="p-10 text-center text-sm text-muted-foreground">Nothing here</Card>
  ) : rows.map((d) => {
    const ageH = (Date.now() - new Date(d.created_at).getTime()) / 3_600_000;
    return (
      <Card key={d.id} className={cn('p-4', d.category === 'safety' && 'border-destructive/50')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {d.category === 'safety' && <ShieldAlert className="h-4 w-4 text-destructive" />}
              <p className="font-semibold capitalize">{d.category.replace('_', ' ')}</p>
              <Badge variant="secondary" className="capitalize">{d.status}</Badge>
              {d.outcome && <Badge className="capitalize">{d.outcome.replace('_', ' ')}</Badge>}
              {d.status === 'open' && ageH > 48 && <Badge variant="destructive">Over 48 h</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {d.service_name} · {d.customer_name ?? 'Customer'} vs {d.provider_name ?? 'Pro'} · bill {inr(d.total_amount)} · {when(d.created_at)}
            </p>
            <p className="mt-2 text-sm">“{d.details}”</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pro reply: {d.provider_reply ? `“${d.provider_reply}”` : 'none yet'}
            </p>
            {d.appeal_note && <p className="mt-1 text-xs"><b>Appeal by {d.appealed_by}:</b> {d.appeal_note}</p>}
            {d.decision_note && <p className="mt-1 text-xs"><b>Decision:</b> {d.decision_note}</p>}
          </div>
          {(d.status === 'open' || d.status === 'appealed') && (
            <Button size="sm" onClick={() => { setActive(d); setOutcome('dismissed'); setNote(''); }}>
              <Gavel className="mr-1 h-4 w-4" /> {d.status === 'appealed' ? 'Review appeal' : 'Decide'}
            </Button>
          )}
        </div>
      </Card>
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fees & disputes</h1>
        <p className="text-sm text-muted-foreground">Flat ₹15 / ₹30 / ₹50 per completed job from the pro wallet. Disputes are decided within 48 hours.</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ['Fees this month', inr(overview.charged_month)],
            ['Fees all time', inr(overview.charged_total)],
            ['Waived (launch)', inr(overview.waived_total)],
            ['Returned (disputes)', inr(overview.refunded_total)],
            ['Open disputes', String(overview.open_disputes)],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs defaultValue="open">
          <TabsList>
            <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
            <TabsTrigger value="closed">Decided ({closed.length})</TabsTrigger>
            <TabsTrigger value="fees">Fee records</TabsTrigger>
          </TabsList>
          <TabsContent value="open" className="mt-4 space-y-3">{list(open)}</TabsContent>
          <TabsContent value="closed" className="mt-4 space-y-3">{list(closed)}</TabsContent>
          <TabsContent value="fees" className="mt-4">
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="p-3">When</th><th className="p-3">Pro</th><th className="p-3">Service bill</th><th className="p-3">Slab fee</th><th className="p-3">Result</th></tr>
                </thead>
                <tbody>
                  {(overview?.recent ?? []).map((f) => (
                    <tr key={f.booking_id} className="border-t border-border">
                      <td className="p-3">{when(f.created_at)}</td>
                      <td className="p-3">{f.provider_name ?? '—'}</td>
                      <td className="p-3">{inr(f.service_bill)}</td>
                      <td className="p-3 font-semibold">{inr(f.slab_fee)}</td>
                      <td className="p-3">
                        {Number(f.refunded) > 0 ? `Returned ${inr(f.refunded)}` : Number(f.waived) > 0 ? 'Waived (launch)' : `Charged ${inr(f.charged)}`}
                      </td>
                    </tr>
                  ))}
                  {(overview?.recent ?? []).length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No completed jobs yet</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!active} onOpenChange={(v) => { if (!v) setActive(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{active?.status === 'appealed' ? 'Appeal: second review' : 'Decide dispute'}</DialogTitle>
            <DialogDescription>Auto-evidence from the booking timeline is below. Your reason goes to both sides and the audit log.</DialogDescription>
          </DialogHeader>
          {active && (
            <div className="rounded-lg bg-secondary/50 p-3 text-xs">
              {Object.entries(TIMELINE_LABEL).map(([k, label]) => (
                <div key={k} className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{when(active.timeline?.[k] as string | undefined)}</span></div>
              ))}
              <div className="flex justify-between"><span className="text-muted-foreground">Locked price</span><span>{inr(active.timeline?.locked_price as number)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Final bill</span><span>{inr(active.timeline?.final_bill as number)}</span></div>
              {Array.isArray(active.timeline?.extras) && (active.timeline.extras as Array<{ title: string; amount: number; status: string }>).map((x, i) => (
                <div key={i} className="flex justify-between"><span className="text-muted-foreground">Extra: {x.title} ({x.status})</span><span>{inr(x.amount)}</span></div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map((o) => (
              <button key={o.value} type="button" onClick={() => setOutcome(o.value)}
                className={cn('rounded-lg border p-2 text-left text-sm', outcome === o.value ? 'border-primary bg-primary/10' : 'border-border')}>
                <p className="font-semibold">{o.label}</p>
                <p className="text-[11px] text-muted-foreground">{o.desc}</p>
              </button>
            ))}
          </div>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (shared with both sides)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>Cancel</Button>
            <Button onClick={decide} disabled={busy || note.trim().length < 5}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save decision'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDisputes;
