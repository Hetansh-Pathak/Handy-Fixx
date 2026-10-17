import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Copy, Loader2 } from 'lucide-react';

type Payout = {
  id: string; amount: number; status: 'pending' | 'processing' | 'paid' | 'failed'; requested_at: string; processed_at: string | null; notes: string | null;
  bank_account_name: string | null; bank_account_number: string | null; bank_ifsc: string | null; upi_id: string | null;
  service_providers: { full_name: string | null; name: string | null; phone: string | null } | null;
};
type Tab = 'open' | 'done';
type Action = 'processing' | 'paid' | 'failed';

const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
const PILL: Record<Payout['status'], string> = {
  pending: 'bg-amber-100 text-amber-800', processing: 'bg-blue-100 text-blue-800', paid: 'bg-emerald-100 text-emerald-800', failed: 'bg-red-100 text-red-800',
};

const Payouts: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ row: Payout; action: Action } | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any).from('payout_requests')
      .select('id, amount, status, requested_at, processed_at, notes, bank_account_name, bank_account_number, bank_ifsc, upi_id, service_providers(full_name, name, phone)')
      .order('requested_at', { ascending: false }).limit(200);
    if (error) setFailed(true); else { setFailed(false); setRows((data ?? []) as unknown as Payout[]); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const list = rows.filter(r => (tab === 'open' ? r.status === 'pending' || r.status === 'processing' : r.status === 'paid' || r.status === 'failed'));
  const openCount = rows.filter(r => r.status === 'pending' || r.status === 'processing').length;

  const run = async () => {
    if (!confirm) return;
    const { row, action } = confirm;
    setBusy(row.id);
    const { data, error } = await (supabase as any).rpc('admin_process_payout', { p_payout_id: row.id, p_action: action, p_notes: note.trim() || null });
    setBusy(null); setConfirm(null); setNote('');
    const res = data as { success?: boolean; error?: string } | null;
    if (error || res?.success === false) toast({ title: 'Could not update payout', description: error?.message ?? res?.error, variant: 'destructive' });
    else { toast({ title: action === 'paid' ? 'Marked as paid' : action === 'failed' ? 'Marked as failed' : 'Marked as processing' }); void load(); }
  };

  const copy = (v: string, label: string) => { void navigator.clipboard?.writeText(v); toast({ title: `${label} copied` }); };
  const verb: Record<Action, string> = { processing: 'Start processing', paid: 'Mark as paid', failed: 'Mark as failed' };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Payouts</h1>
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
        <TabsList><TabsTrigger value="open">To pay{openCount > 0 ? ` (${openCount})` : ''}</TabsTrigger><TabsTrigger value="done">History</TabsTrigger></TabsList>
      </Tabs>

      {loading ? [0, 1, 2].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
        : failed ? <Card className="p-8 text-center"><p className="font-semibold">Couldn't load payouts</p><Button className="mt-3" onClick={() => { setLoading(true); void load(); }}>Try again</Button></Card>
        : list.length === 0 ? <Card className="p-10 text-center text-muted-foreground">{tab === 'open' ? 'No payouts waiting.' : 'No payout history yet.'}</Card>
        : list.map(r => (
          <Card key={r.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{r.service_providers?.full_name ?? r.service_providers?.name ?? 'Provider'}</p>
                <p className="text-sm text-muted-foreground">{r.service_providers?.phone ?? ''} · requested {new Date(r.requested_at).toLocaleString('en-IN')}</p>
              </div>
              <div className="text-right"><p className="text-xl font-bold">{inr(r.amount)}</p><Badge className={PILL[r.status]} variant="secondary">{r.status}</Badge></div>
            </div>

            <div className="rounded-lg bg-muted p-3 text-sm">
              {r.upi_id && <p className="flex items-center justify-between">UPI: <b>{r.upi_id}</b><button aria-label="Copy UPI ID" onClick={() => copy(r.upi_id!, 'UPI ID')}><Copy className="h-4 w-4" /></button></p>}
              {r.bank_account_number && (
                <>
                  <p>{r.bank_account_name}</p>
                  <p className="flex items-center justify-between">Account: <b>{r.bank_account_number}</b><button aria-label="Copy account number" onClick={() => copy(r.bank_account_number!, 'Account number')}><Copy className="h-4 w-4" /></button></p>
                  <p>IFSC: <b>{r.bank_ifsc}</b></p>
                </>
              )}
              {!r.upi_id && !r.bank_account_number && <p className="text-red-600">No payout details on this request.</p>}
            </div>
            {r.notes && <p className="text-sm text-muted-foreground">Note: {r.notes}</p>}

            {(r.status === 'pending' || r.status === 'processing') && (
              <div className="flex flex-wrap gap-2">
                {r.status === 'pending' && <Button variant="outline" disabled={busy === r.id} onClick={() => setConfirm({ row: r, action: 'processing' })}>Start processing</Button>}
                <Button disabled={busy === r.id} onClick={() => setConfirm({ row: r, action: 'paid' })}>{busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark as paid'}</Button>
                <Button variant="destructive" disabled={busy === r.id} onClick={() => setConfirm({ row: r, action: 'failed' })}>Mark as failed</Button>
              </div>
            )}
          </Card>
        ))}

      <AlertDialog open={!!confirm} onOpenChange={o => { if (!o) { setConfirm(null); setNote(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? `${verb[confirm.action]}: ${inr(confirm.row.amount)}` : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === 'paid' && 'Only confirm after the money has left your account. The provider is notified.'}
              {confirm?.action === 'failed' && 'The amount goes back to the provider\'s balance and they are told why.'}
              {confirm?.action === 'processing' && 'The provider is told their withdrawal is in progress.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder={confirm?.action === 'failed' ? 'Reason (shown to the provider)' : 'Note, e.g. UPI reference (optional)'} />
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={run} disabled={confirm?.action === 'failed' && !note.trim()}>{confirm ? verb[confirm.action] : ''}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Payouts;
