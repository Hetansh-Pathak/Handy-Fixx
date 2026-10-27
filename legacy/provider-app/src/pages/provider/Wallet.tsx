import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Loader2, Wallet as WalletIcon, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useProvider } from '@/contexts/ProviderContext';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/hooks/useWallet';
import { BLOCK_MESSAGE, TX_LABEL, callEdge, inr, loadRazorpay, type WalletTx } from '@/lib/wallet';
import LockedPage from '@/components/provider/LockedPage';

type Payout = { id: string; amount: number; status: string; requested_at: string };

const payoutColors: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  processing: 'bg-blue-500/20 text-blue-400',
  paid: 'bg-success/20 text-success',
  failed: 'bg-destructive/20 text-destructive',
};

const Wallet: React.FC = () => {
  const { provider, refreshProvider } = useProvider();
  const { summary, refresh } = useWallet();
  const { toast } = useToast();
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [wdOpen, setWdOpen] = useState(false);
  const [wdAmount, setWdAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const loadLists = useCallback(async () => {
    if (!provider?.id) return;
    const [t, p] = await Promise.all([
      (supabase as any).from('wallet_transactions').select('id, type, amount, note, booking_id, created_at')
        .eq('provider_id', provider.id).order('created_at', { ascending: false }).limit(100),
      (supabase as any).from('payout_requests').select('id, amount, status, requested_at')
        .eq('provider_id', provider.id).order('requested_at', { ascending: false }).limit(50),
    ]);
    setTxs((t.data ?? []) as WalletTx[]);
    setPayouts((p.data ?? []) as Payout[]);
  }, [provider?.id]);

  useEffect(() => { void loadLists(); }, [loadLists]);
  useEffect(() => {
    if (!provider?.id) return;
    const channel = supabase
      .channel(`wallet-lists-${provider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `provider_id=eq.${provider.id}` }, () => { void loadLists(); void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests', filter: `provider_id=eq.${provider.id}` }, () => void loadLists())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [provider?.id, loadLists, refresh]);

  if (provider?.kyc_status !== 'approved') return <LockedPage pageName="Wallet" />;

  const dues = summary?.dues ?? 0;
  const limit = summary?.dues_limit ?? 300;
  const available = summary?.available ?? 0;
  const pct = Math.min(100, Math.round((dues / limit) * 100));

  const openPay = () => {
    setPayAmount(dues > 0 ? String(Math.ceil(dues)) : '');
    setPayOpen(true);
  };

  /** After Razorpay says "paid", the webhook credits the wallet. Poll until it shows up. */
  const waitForCredit = async (before: number) => {
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data } = await (supabase as any).rpc('get_wallet_summary');
      if (data?.ok && Number(data.balance) !== before) {
        await refresh(); await loadLists(); await refreshProvider();
        toast({ title: 'Payment received', description: 'Your wallet has been updated. Switch online when you are ready.' });
        return;
      }
    }
    toast({ title: 'Payment is being confirmed', description: 'It can take a minute. Your wallet will update by itself.' });
  };

  const startPay = async () => {
    const rupees = Number(payAmount);
    if (!Number.isInteger(rupees) || rupees < 1) {
      toast({ title: 'Enter a whole rupee amount', variant: 'destructive' });
      return;
    }
    setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Could not load the payment window. Check your internet connection.');
      const order = await callEdge<{ order_id: string; amount_paise: number; key_id: string; prefill: Record<string, string> }>(
        'create-wallet-topup-order', { amount: rupees });
      const before = summary?.balance ?? 0;
      const Razorpay = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void } }).Razorpay;
      const rzp = new Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount_paise,
        currency: 'INR',
        name: 'HandyFix',
        description: 'Pay dues',
        prefill: order.prefill,
        theme: { color: '#D4A017' },
        handler: () => { setPayOpen(false); void waitForCredit(before); },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.on('payment.failed', () => toast({ title: 'Payment failed', description: 'No money was taken. Please try again.', variant: 'destructive' }));
      rzp.open();
    } catch (e) {
      toast({ title: 'Could not start payment', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  };

  const withdraw = async () => {
    const amount = Number(wdAmount);
    if (!(amount > 0)) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    setWithdrawing(true);
    const { data, error } = await (supabase as any).rpc('request_payout', { p_amount: amount });
    setWithdrawing(false);
    if (error || !data?.ok) {
      const reasons: Record<string, string> = {
        below_minimum: `Minimum withdrawal is ${inr(summary?.min_payout ?? 100)}.`,
        insufficient_balance: 'You do not have that much available.',
        no_payout_details: 'Add your bank or UPI details in Profile first.',
        not_approved: 'Your account must be approved first.',
        invalid_amount: 'Enter a valid amount.',
      };
      toast({ title: 'Withdrawal not possible', description: reasons[data?.reason] ?? error?.message ?? 'Please try again.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Withdrawal requested', description: 'Funds arrive in 1-2 business days after approval.' });
    setWdOpen(false);
    setWdAmount('');
    await refresh(); await loadLists();
  };

  return (
    <div className="space-y-5 pb-24">
      {summary?.blocked && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{BLOCK_MESSAGE[summary.block_reason ?? 'dues_limit']}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="glass-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Available to withdraw</p>
          <p className="mt-1 text-3xl font-extrabold text-primary">{inr(available)}</p>
          <Button className="mt-4 w-full gold-gradient text-primary-foreground font-bold rounded-xl"
            disabled={available < (summary?.min_payout ?? 100)} onClick={() => { setWdAmount(String(Math.floor(available))); setWdOpen(true); }}>
            <ArrowDownToLine className="mr-2 h-4 w-4" /> Withdraw
          </Button>
          {available > 0 && available < (summary?.min_payout ?? 100) && (
            <p className="mt-2 text-[11px] text-muted-foreground">Minimum withdrawal is {inr(summary?.min_payout ?? 100)}.</p>
          )}
        </Card>

        <Card className="glass-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Dues you owe HandyFix</p>
          <p className={`mt-1 text-3xl font-extrabold ${dues > 0 ? 'text-warning' : 'text-success'}`}>{inr(dues)}</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className={`h-full ${pct >= 100 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Limit {inr(limit)}. At the limit you go offline until you pay. Dues are also taken automatically from your next online payment.
          </p>
          <Button variant="outline" className="mt-3 w-full rounded-xl border-primary/40 text-primary" disabled={dues <= 0} onClick={openPay}>
            <CreditCard className="mr-2 h-4 w-4" /> Pay dues by UPI
          </Button>
        </Card>
      </div>

      <Tabs defaultValue="history">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="payouts">Withdrawals</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4 space-y-2">
          {txs.length === 0 ? (
            <Card className="glass-card p-8 text-center text-muted-foreground">
              <WalletIcon className="mx-auto mb-2 h-6 w-6" /> No wallet activity yet
            </Card>
          ) : txs.map((t) => (
            <Card key={t.id} className="glass-card flex items-center justify-between p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{TX_LABEL[t.type] ?? t.type}</p>
                <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString('en-IN')}</p>
              </div>
              <p className={`shrink-0 text-sm font-bold ${Number(t.amount) >= 0 ? 'text-success' : 'text-warning'}`}>
                {Number(t.amount) >= 0 ? '+' : '-'}{inr(Math.abs(Number(t.amount)))}
              </p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="payouts" className="mt-4 space-y-2">
          {payouts.length === 0 ? (
            <Card className="glass-card p-8 text-center text-muted-foreground">No withdrawals yet</Card>
          ) : payouts.map((p) => (
            <Card key={p.id} className="glass-card flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-medium">{inr(p.amount)}</p>
                <p className="text-xs text-muted-foreground">{new Date(p.requested_at).toLocaleDateString('en-IN')}</p>
              </div>
              <Badge className={payoutColors[p.status] ?? ''} variant="secondary">{p.status}</Badge>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay dues</DialogTitle>
            <DialogDescription>Pay by UPI or card. Your wallet updates as soon as the payment is confirmed.</DialogDescription>
          </DialogHeader>
          <Input inputMode="numeric" value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/\D/g, ''))} placeholder="Amount in ₹" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button className="gold-gradient text-primary-foreground font-bold" onClick={startPay} disabled={paying}>
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ₹${payAmount || 0}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wdOpen} onOpenChange={setWdOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Withdraw</DialogTitle>
            <DialogDescription>
              Sent to {provider?.bank_account_number ? `bank account ending ${provider.bank_account_number.slice(-4)}` : provider?.upi_id ? `UPI ${provider.upi_id}` : 'your saved payout details (add them in Profile)'}.
            </DialogDescription>
          </DialogHeader>
          <Input inputMode="decimal" value={wdAmount} onChange={(e) => setWdAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Amount in ₹" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setWdOpen(false)}>Cancel</Button>
            <Button className="gold-gradient text-primary-foreground font-bold" onClick={withdraw} disabled={withdrawing}>
              {withdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Request withdrawal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Wallet;
