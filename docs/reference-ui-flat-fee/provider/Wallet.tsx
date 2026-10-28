import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowDownToLine, Loader2, Wallet as WalletIcon, Plus, Gift, Receipt, Info,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';

type Payout = { id: string; amount: number; status: string; requested_at: string };
type FeeRow = {
  booking_id: string;
  final_bill: number;
  service_bill: number;
  fee: number;
  status: 'charged' | 'waived' | 'refunded';
  created_at: string;
  bookings?: { sub_item_name: string | null; services?: { name: string } | null } | null;
};

const payoutColors: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  processing: 'bg-blue-500/20 text-blue-400',
  paid: 'bg-success/20 text-success',
  failed: 'bg-destructive/20 text-destructive',
};

const feeStatus: Record<FeeRow['status'], { label: string; cls: string }> = {
  charged: { label: 'Deducted', cls: 'bg-secondary text-foreground' },
  waived: { label: 'Waived', cls: 'bg-success/15 text-success' },
  refunded: { label: 'Returned', cls: 'bg-blue-500/15 text-blue-400' },
};

const QUICK_TOPUPS = [100, 200, 500];

const Wallet: React.FC = () => {
  const { provider, refreshProvider } = useProvider();
  const { summary, refresh } = useWallet();
  const { toast } = useToast();
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [wdOpen, setWdOpen] = useState(false);
  const [wdAmount, setWdAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const loadLists = useCallback(async () => {
    if (!provider?.id) return;
    const [t, f, p] = await Promise.all([
      (supabase as any).from('wallet_transactions').select('id, type, amount, note, booking_id, created_at')
        .eq('provider_id', provider.id).order('created_at', { ascending: false }).limit(100),
      (supabase as any).from('booking_fees')
        .select('booking_id, final_bill, service_bill, fee, status, created_at, bookings(sub_item_name, services(name))')
        .eq('provider_id', provider.id).order('created_at', { ascending: false }).limit(100),
      (supabase as any).from('payout_requests').select('id, amount, status, requested_at')
        .eq('provider_id', provider.id).order('requested_at', { ascending: false }).limit(50),
    ]);
    setTxs((t.data ?? []) as WalletTx[]);
    setFees((f.data ?? []) as FeeRow[]);
    setPayouts((p.data ?? []) as Payout[]);
  }, [provider?.id]);

  useEffect(() => { void loadLists(); }, [loadLists]);
  useEffect(() => {
    if (!provider?.id) return;
    const channel = supabase
      .channel(`wallet-lists-${provider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `provider_id=eq.${provider.id}` }, () => { void loadLists(); void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_fees', filter: `provider_id=eq.${provider.id}` }, () => void loadLists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests', filter: `provider_id=eq.${provider.id}` }, () => void loadLists())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [provider?.id, loadLists, refresh]);

  if (provider?.kyc_status !== 'approved') return <LockedPage pageName="Wallet" />;

  const balance = Number(summary?.balance ?? 0);
  const dues = Number(summary?.dues ?? 0);
  const available = Number(summary?.available ?? 0);
  const minTopup = Number(summary?.min_topup ?? 100);
  const minPayout = Number(summary?.min_payout ?? 100);
  const launch = summary?.launch;
  const slabs = summary?.slabs ?? [
    { fee: 15, label: 'Under ₹500' }, { fee: 30, label: '₹500 to ₹1500' }, { fee: 50, label: 'Above ₹1500' },
  ];

  const openTopup = (amount?: number) => {
    setPayAmount(String(amount ?? Math.max(minTopup, Math.ceil(dues))));
    setPayOpen(true);
  };

  /** After Razorpay says "paid", the webhook credits the wallet. Poll until it shows up. */
  const waitForCredit = async (before: number) => {
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data } = await (supabase as any).rpc('get_wallet_summary');
      if (data?.ok && Number(data.balance) !== before) {
        await refresh(); await loadLists(); await refreshProvider();
        toast({ title: 'Wallet topped up', description: 'You can accept new requests now.' });
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
    if (rupees < minTopup && rupees < dues) {
      toast({ title: `Minimum top-up is ${inr(minTopup)}`, variant: 'destructive' });
      return;
    }
    setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Could not load the payment window. Check your internet connection.');
      const order = await callEdge<{ order_id: string; amount_paise: number; key_id: string; prefill: Record<string, string> }>(
        'create-wallet-topup-order', { amount: rupees });
      const Razorpay = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void } }).Razorpay;
      const rzp = new Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount_paise,
        currency: 'INR',
        name: 'HandyFix',
        description: 'Wallet top-up',
        prefill: order.prefill,
        theme: { color: '#F5B700' },
        handler: () => { setPayOpen(false); void waitForCredit(balance); },
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
        below_minimum: `Minimum withdrawal is ${inr(minPayout)}.`,
        insufficient_balance: 'You do not have that much in your wallet.',
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

  const daysLeft = launch?.ends_at
    ? Math.max(0, Math.ceil((new Date(launch.ends_at).getTime() - Date.now()) / 86_400_000))
    : 0;

  return (
    <div className="space-y-5 pb-24">
      {summary?.blocked && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">{inr(dues)} due</p>
            <p className="text-xs text-destructive/90">{BLOCK_MESSAGE[summary.block_reason ?? 'dues']}</p>
          </div>
          <Button size="sm" className="gold-gradient text-primary-foreground font-bold rounded-xl" onClick={() => openTopup()}>
            Pay {inr(Math.max(minTopup, Math.ceil(dues)))}
          </Button>
        </div>
      )}

      {/* Balance hero */}
      <Card className="relative overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-950 p-6 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">Wallet balance</p>
        <p className={cn('mt-1 text-4xl font-extrabold tracking-tight', balance < 0 ? 'text-red-400' : 'text-amber-400')}>
          {balance < 0 ? '−' : ''}{inr(Math.abs(balance))}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/70">
          <span>Due balance <b className="text-white">{inr(dues)}</b></span>
          <span>Fees this month <b className="text-white">{inr(summary?.fees_this_month ?? 0)}</b></span>
          {Number(summary?.waived_this_month ?? 0) > 0 && (
            <span>Waived this month <b className="text-emerald-300">{inr(summary?.waived_this_month ?? 0)}</b></span>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button className="h-11 rounded-xl bg-amber-400 font-bold text-zinc-900 hover:bg-amber-300" onClick={() => openTopup(minTopup)}>
            <Plus className="mr-1.5 h-4 w-4" /> Top up {inr(minTopup)}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            disabled={available < minPayout}
            onClick={() => { setWdAmount(String(Math.floor(available))); setWdOpen(true); }}
          >
            <ArrowDownToLine className="mr-1.5 h-4 w-4" /> Withdraw
          </Button>
        </div>
      </Card>

      {/* Launch period */}
      {launch?.active && (
        <Card className="flex items-start gap-3 rounded-2xl border-success/30 bg-success/10 p-4">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-success">Free launch period: fees waived</p>
            <p className="text-xs text-muted-foreground">
              {launch.jobs_left} fee-free job{launch.jobs_left === 1 ? '' : 's'} left · {daysLeft} day{daysLeft === 1 ? '' : 's'} left.
              You still see the real fee on each job as “waived”. No wallet balance needed yet.
            </p>
          </div>
        </Card>
      )}

      {/* How the fee works */}
      <Card className="glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Flat fee, only on completed jobs</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {slabs.map((s) => (
            <div key={s.label} className="rounded-xl bg-zinc-900 p-3 text-center">
              <p className="text-xl font-extrabold text-amber-400">{inr(s.fee)}</p>
              <p className="text-[10px] text-white/60">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Taken after the customer's code closes the job. Parts are not counted. Declining, missing or a cancelled job costs ₹0.
          Accepting needs your wallet to cover that job's fee.
        </p>
      </Card>

      <Tabs defaultValue="fees">
        <TabsList className="grid w-full grid-cols-3 bg-secondary/50">
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="history">Wallet</TabsTrigger>
          <TabsTrigger value="payouts">Withdrawals</TabsTrigger>
        </TabsList>

        <TabsContent value="fees" className="mt-4 space-y-2">
          {fees.length === 0 ? (
            <Card className="glass-card p-8 text-center text-sm text-muted-foreground">
              <Receipt className="mx-auto mb-2 h-6 w-6" /> Fees appear here after each completed job
            </Card>
          ) : fees.map((f) => (
            <Card key={f.booking_id} className="glass-card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {f.bookings?.sub_item_name || f.bookings?.services?.name || 'Job'} · {inr(f.final_bill)}
                </p>
                <p className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString('en-IN')}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn('text-sm font-bold', f.status === 'charged' ? 'text-foreground' : 'text-muted-foreground line-through')}>
                  {inr(f.fee)}
                </p>
                <Badge variant="secondary" className={cn('mt-0.5 text-[10px]', feeStatus[f.status].cls)}>{feeStatus[f.status].label}</Badge>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-2">
          {txs.length === 0 ? (
            <Card className="glass-card p-8 text-center text-sm text-muted-foreground">
              <WalletIcon className="mx-auto mb-2 h-6 w-6" /> No wallet activity yet
            </Card>
          ) : txs.map((t) => (
            <Card key={t.id} className="glass-card flex items-center justify-between p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{TX_LABEL[t.type] ?? t.type}</p>
                <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString('en-IN')}</p>
              </div>
              <p className={`shrink-0 text-sm font-bold ${Number(t.amount) >= 0 ? 'text-success' : 'text-foreground'}`}>
                {Number(t.amount) >= 0 ? '+' : '−'}{inr(Math.abs(Number(t.amount)))}
              </p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="payouts" className="mt-4 space-y-2">
          {payouts.length === 0 ? (
            <Card className="glass-card p-8 text-center text-sm text-muted-foreground">No withdrawals yet</Card>
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
            <DialogTitle>Top up wallet</DialogTitle>
            <DialogDescription>Pay by UPI or card. Fees are taken from this balance only after a job is completed.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_TOPUPS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setPayAmount(String(a))}
                className={cn('rounded-xl border py-2 text-sm font-semibold transition',
                  payAmount === String(a) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50')}
              >
                {inr(a)}
              </button>
            ))}
          </div>
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
            <DialogTitle>Withdraw unused balance</DialogTitle>
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
