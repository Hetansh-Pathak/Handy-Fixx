import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, TrendingUp, Clock, Loader2, Wallet, ArrowDownToLine } from 'lucide-react';

const Earnings: React.FC = () => {
  const { provider, refreshProvider } = useProvider();
  const { toast } = useToast();
  const [earnings, setEarnings] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [tab, setTab] = useState('overview');

  const fetchEarnings = useCallback(async () => {
    if (!provider) return;
    const { data } = await supabase
      .from('provider_earnings')
      .select('*')
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false });
    setEarnings(data || []);
  }, [provider]);

  const fetchPayouts = useCallback(async () => {
    if (!provider) return;
    const { data } = await supabase
      .from('payout_requests')
      .select('*')
      .eq('provider_id', provider.id)
      .order('requested_at', { ascending: false });
    setPayouts(data || []);
  }, [provider]);

  useEffect(() => { fetchEarnings(); fetchPayouts(); }, [fetchEarnings, fetchPayouts]);

  // Realtime: refresh when DB trigger auto-inserts an earnings row on booking completion
  // or when payout status is updated by admin
  useEffect(() => {
    if (!provider) return;
    const channel = supabase.channel('earnings-live')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'provider_earnings',
        filter: `provider_id=eq.${provider.id}`,
      }, () => { fetchEarnings(); refreshProvider(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'payout_requests',
        filter: `provider_id=eq.${provider.id}`,
      }, () => fetchPayouts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [provider, fetchEarnings, fetchPayouts, refreshProvider]);

  const totals = useMemo(() => {
    const total = earnings.reduce((s, e) => s + Number(e.provider_amount), 0);
    const pending = earnings.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.provider_amount), 0);
    const paid = earnings.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.provider_amount), 0);
    return { total, pending, paid };
  }, [earnings]);

  const monthlyData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const month = d.toLocaleString('default', { month: 'short' });
      const year = d.getFullYear();
      const monthNum = d.getMonth();
      const amount = earnings
        .filter(e => { const eD = new Date(e.created_at); return eD.getMonth() === monthNum && eD.getFullYear() === year; })
        .reduce((sum, e) => sum + Number(e.provider_amount), 0);
      return { month, amount };
    });
  }, [earnings]);

  const handleWithdraw = async () => {
    if (!provider) return;
    if (!provider.bank_account_number && !provider.upi_id) {
      toast({ title: 'Add bank details first', description: 'Go to Profile → Bank Details', variant: 'destructive' });
      return;
    }
    if (totals.pending <= 0) {
      toast({ title: 'No pending earnings', description: 'Nothing to withdraw right now.', variant: 'destructive' });
      return;
    }
    setWithdrawing(true);
    const { error } = await supabase.from('payout_requests').insert({
      provider_id: provider.id,
      amount: totals.pending,
      bank_account_name: provider.bank_account_name,
      bank_account_number: provider.bank_account_number,
      bank_ifsc: provider.bank_ifsc,
      upi_id: provider.upi_id,
    });
    if (!error) {
      await supabase.from('provider_earnings')
        .update({ status: 'processing' })
        .eq('provider_id', provider.id)
        .eq('status', 'pending');

      // Insert a notification for the provider
      await supabase.from('provider_notifications').insert({
        provider_id: provider.id,
        type: 'payment',
        title: 'Withdrawal Requested 💸',
        message: `₹${totals.pending.toLocaleString()} withdrawal request submitted. Funds arrive in 1-2 business days.`,
        data: {},
      });

      toast({ title: 'Withdrawal Requested! 💸', description: 'Funds will arrive in 1-2 business days.' });
      setWithdrawOpen(false);
      fetchEarnings();
      fetchPayouts();
      refreshProvider();
    } else {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setWithdrawing(false);
  };

  const payoutStatusColors: Record<string, string> = {
    pending: 'bg-warning/20 text-warning',
    processing: 'bg-blue-500/20 text-blue-400',
    paid: 'bg-success/20 text-success',
    failed: 'bg-destructive/20 text-destructive',
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Earnings', value: totals.total, icon: DollarSign, color: 'text-primary' },
          { label: 'Pending', value: totals.pending, icon: Clock, color: 'text-warning' },
          { label: 'Paid Out', value: totals.paid, icon: TrendingUp, color: 'text-success' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="glass-card p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</span>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold">₹{s.value.toLocaleString()}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Withdraw Button */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogTrigger asChild>
          <Button className="gold-gradient text-primary-foreground font-semibold" disabled={totals.pending <= 0}>
            <Wallet className="h-4 w-4 mr-2" />
            Withdraw ₹{totals.pending.toLocaleString()}
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirm Withdrawal</DialogTitle>
            <DialogDescription>₹{totals.pending.toLocaleString()} will be transferred to your account within 1-2 business days.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm font-medium mb-1">Paying to:</p>
            {provider?.bank_account_number ? (
              <>
                <p className="font-semibold">{provider.bank_account_name}</p>
                <p className="text-sm text-muted-foreground">{provider.bank_ifsc} · **** {provider.bank_account_number?.slice(-4)}</p>
              </>
            ) : provider?.upi_id ? (
              <p className="font-semibold">UPI: {provider.upi_id}</p>
            ) : (
              <p className="text-destructive text-sm">⚠️ No payment details. Add them in Profile first.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button className="gold-gradient text-primary-foreground font-semibold" onClick={handleWithdraw} disabled={withdrawing || (!provider?.bank_account_number && !provider?.upi_id)}>
              {withdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Withdrawal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="payouts">Payout History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="glass-card p-4">
            <h3 className="font-semibold mb-4">Monthly Earnings</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="month" stroke="hsl(40 6% 55%)" fontSize={12} />
                <YAxis stroke="hsl(40 6% 55%)" fontSize={12} tickFormatter={v => `₹${v}`} />
                <Tooltip contentStyle={{ background: 'hsl(30 5% 12%)', border: '1px solid hsl(30 5% 20%)', borderRadius: '8px', color: 'hsl(40 10% 90%)' }}
                  formatter={(v: number) => [`₹${v}`, 'Earnings']} />
                <Bar dataKey="amount" fill="hsl(45 100% 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4 space-y-2">
          {earnings.length === 0 ? (
            <Card className="glass-card p-8 text-center text-muted-foreground">No earnings yet</Card>
          ) : earnings.map((e, i) => (
            <motion.div key={e.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="glass-card p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">₹{Number(e.provider_amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</p>
                </div>
                <Badge className={e.status === 'paid' ? 'bg-success/20 text-success' : e.status === 'processing' ? 'bg-blue-500/20 text-blue-400' : 'bg-warning/20 text-warning'} variant="secondary">
                  {e.status}
                </Badge>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="payouts" className="mt-4 space-y-2">
          {payouts.length === 0 ? (
            <Card className="glass-card p-8 text-center text-muted-foreground">No payout history</Card>
          ) : payouts.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="glass-card p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">₹{Number(p.amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.requested_at).toLocaleDateString()}</p>
                </div>
                <Badge className={payoutStatusColors[p.status] || ''} variant="secondary">{p.status}</Badge>
              </Card>
            </motion.div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Earnings;
