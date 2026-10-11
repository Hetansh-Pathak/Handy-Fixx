import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const sb = supabase as any;
const inr = (n: number | string | null | undefined) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN') : '-');

type Wallet = { provider_id: string; full_name: string; phone: string | null; status: string; is_online: boolean | null; balance: number; dues: number; block_reason: string | null; last_activity: string | null };
type Dispute = { id: string; booking_id: string; status: string; reason: string; resolution_note: string | null; created_at: string; provider_name: string; provider_phone: string | null; customer_name: string | null; customer_phone: string | null; total_amount: number; platform_fee: number; paid_at: string | null };
type Payout = { id: string; provider_id: string; amount: number; status: string; requested_at: string; admin_note: string | null; bank_account_name: string | null; bank_account_number: string | null; bank_ifsc: string | null; upi_id: string | null; provider_name: string; provider_phone: string | null };
type Issue = { id: string; event_type: string; result: string; booking_id: string | null; razorpay_payment_id: string | null; amount: number | null; note: string | null; created_at: string };

const AdminWallets: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [outcome, setOutcome] = useState<'upheld' | 'rejected'>('rejected');
  const [note, setNote] = useState('');
  const [adjust, setAdjust] = useState('');

  const [adjTarget, setAdjTarget] = useState<Wallet | null>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [w, d, p, i] = await Promise.all([
      sb.rpc('admin_get_wallet_overview'),
      sb.rpc('admin_list_disputes'),
      sb.rpc('admin_list_payouts'),
      sb.rpc('admin_list_payment_issues'),
    ]);
    const firstError = w.error ?? d.error ?? p.error ?? i.error;
    if (firstError) toast({ title: 'Could not load wallet data', description: firstError.message, variant: 'destructive' });
    setWallets((w.data ?? []) as Wallet[]);
    setDisputes((d.data ?? []) as Dispute[]);
    setPayouts((p.data ?? []) as Payout[]);
    setIssues((i.data ?? []) as Issue[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: string, args: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    const { data, error } = await sb.rpc(fn, args);
    setBusy(false);
    if (error || !data?.success) {
      toast({ title: 'Failed', description: data?.error ?? error?.message ?? 'Try again', variant: 'destructive' });
      return false;
    }
    toast({ title: okMsg });
    await load();
    return true;
  };

  const resolve = async () => {
    if (!dispute) return;
    const ok = await run('admin_resolve_dispute', {
      p_dispute_id: dispute.id, p_outcome: outcome, p_note: note, p_adjustment: adjust ? Number(adjust) : 0,
    }, 'Dispute resolved');
    if (ok) { setDispute(null); setNote(''); setAdjust(''); }
  };

  const saveAdjust = async () => {
    if (!adjTarget) return;
    const ok = await run('admin_wallet_adjustment', { p_provider_id: adjTarget.provider_id, p_amount: Number(adjAmount), p_note: adjNote }, 'Wallet adjusted');
    if (ok) { setAdjTarget(null); setAdjAmount(''); setAdjNote(''); }
  };

  const totalDues = wallets.reduce((s, w) => s + Number(w.dues), 0);
  const openDisputes = disputes.filter((d) => d.status === 'open').length;
  const openPayouts = payouts.filter((p) => ['pending', 'processing'].includes(p.status)).length;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total dues owed to us</p><p className="text-2xl font-bold">{inr(totalDues)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Providers blocked</p><p className="text-2xl font-bold">{wallets.filter((w) => w.block_reason).length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Open disputes</p><p className="text-2xl font-bold">{openDisputes}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Withdrawals to pay</p><p className="text-2xl font-bold">{openPayouts}</p></Card>
      </div>

      <Tabs defaultValue="wallets">
        <TabsList>
          <TabsTrigger value="wallets">Provider wallets</TabsTrigger>
          <TabsTrigger value="disputes">Disputes{openDisputes ? ` (${openDisputes})` : ''}</TabsTrigger>
          <TabsTrigger value="payouts">Withdrawals{openPayouts ? ` (${openPayouts})` : ''}</TabsTrigger>
          <TabsTrigger value="issues">Payment issues{issues.length ? ` (${issues.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="wallets" className="mt-4 space-y-2">
          {wallets.length === 0 && <Card className="p-8 text-center text-muted-foreground">No wallets yet</Card>}
          {wallets.map((w) => (
            <Card key={w.provider_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">{w.full_name} <span className="text-xs text-muted-foreground">{w.phone}</span></p>
                <p className="text-xs text-muted-foreground">Last activity: {when(w.last_activity)}</p>
              </div>
              <div className="flex items-center gap-3">
                {w.block_reason && <Badge variant="destructive">{w.block_reason === 'dues_limit' ? 'Dues limit' : 'Unsettled job'}</Badge>}
                {w.is_online && <Badge variant="secondary">online</Badge>}
                <div className="text-right">
                  <p className={`font-bold ${Number(w.balance) < 0 ? 'text-destructive' : ''}`}>{inr(w.balance)}</p>
                  <p className="text-[11px] text-muted-foreground">{Number(w.dues) > 0 ? `owes ${inr(w.dues)}` : 'balance'}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAdjTarget(w)}><Plus className="mr-1 h-3 w-3" /> Adjust</Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="disputes" className="mt-4 space-y-2">
          {disputes.length === 0 && <Card className="p-8 text-center text-muted-foreground">No disputes</Card>}
          {disputes.map((d) => (
            <Card key={d.id} className="space-y-1 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{inr(d.total_amount)} cash · #{d.booking_id.slice(0, 8).toUpperCase()}</p>
                <Badge variant={d.status === 'open' ? 'destructive' : 'secondary'}>{d.status}</Badge>
              </div>
              <p className="text-sm">&ldquo;{d.reason}&rdquo;</p>
              <p className="text-xs text-muted-foreground">
                Customer: {d.customer_name ?? '-'} {d.customer_phone ?? ''} · Provider: {d.provider_name} {d.provider_phone ?? ''} · Cash recorded {when(d.paid_at)}
              </p>
              {d.resolution_note && <p className="text-xs text-muted-foreground">Resolution: {d.resolution_note}</p>}
              {d.status === 'open' && <Button size="sm" className="mt-1" onClick={() => { setDispute(d); setOutcome('rejected'); }}>Resolve</Button>}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="payouts" className="mt-4 space-y-2">
          {payouts.length === 0 && <Card className="p-8 text-center text-muted-foreground">No withdrawals</Card>}
          {payouts.map((p) => (
            <Card key={p.id} className="space-y-1 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{inr(p.amount)} to {p.provider_name} <span className="text-xs text-muted-foreground">{p.provider_phone}</span></p>
                <Badge variant={['pending', 'processing'].includes(p.status) ? 'destructive' : 'secondary'}>{p.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {p.bank_account_number ? `${p.bank_account_name ?? ''} · ${p.bank_ifsc ?? ''} · A/C ${p.bank_account_number}` : p.upi_id ? `UPI ${p.upi_id}` : 'No payout details'} · requested {when(p.requested_at)}
              </p>
              {['pending', 'processing'].includes(p.status) && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" disabled={busy} onClick={() => void run('admin_process_payout', { p_payout_id: p.id, p_status: 'paid', p_note: 'Paid manually' }, 'Marked as paid')}>Mark paid (after you transfer)</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('admin_process_payout', { p_payout_id: p.id, p_status: 'failed', p_note: 'Transfer failed' }, 'Marked failed, money returned')}>Failed (return to wallet)</Button>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="issues" className="mt-4 space-y-2">
          {issues.length === 0 && <Card className="p-8 text-center text-muted-foreground">No payment issues. Everything matched.</Card>}
          {issues.map((i) => (
            <Card key={i.id} className="space-y-1 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{i.result.replace(/_/g, ' ')} {i.amount != null ? `· ${inr(i.amount)}` : ''}</p>
                <span className="text-xs text-muted-foreground">{when(i.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{i.note}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{i.razorpay_payment_id}</p>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!dispute} onOpenChange={(o) => !o && setDispute(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve dispute</DialogTitle>
            <DialogDescription>
              Upheld = the customer is right. Rejected = the cash payment stands. Optionally adjust the provider wallet (for example -60 to charge a penalty, +60 to give the fee back).
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant={outcome === 'upheld' ? 'default' : 'outline'} onClick={() => setOutcome('upheld')}>Upheld</Button>
            <Button variant={outcome === 'rejected' ? 'default' : 'outline'} onClick={() => setOutcome('rejected')}>Rejected</Button>
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note (visible to customer and provider)" rows={3} />
          <Input value={adjust} onChange={(e) => setAdjust(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="Wallet adjustment in ₹ (optional, e.g. -60)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispute(null)}>Cancel</Button>
            <Button onClick={resolve} disabled={busy || note.trim().length < 5}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjTarget} onOpenChange={(o) => !o && setAdjTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust wallet: {adjTarget?.full_name}</DialogTitle>
            <DialogDescription>Positive adds money to the provider, negative adds dues. Every adjustment is recorded in the ledger and the audit log.</DialogDescription>
          </DialogHeader>
          <Input value={adjAmount} onChange={(e) => setAdjAmount(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="Amount in ₹ (e.g. 100 or -100)" />
          <Textarea value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="Reason (required)" rows={2} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjTarget(null)}>Cancel</Button>
            <Button onClick={saveAdjust} disabled={busy || !Number(adjAmount) || adjNote.trim().length < 5}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminWallets;
