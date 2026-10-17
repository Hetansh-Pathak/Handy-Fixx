import { useCallback, useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useProvider } from '@/contexts/ProviderContext';
import { useWallet } from '@/hooks/useWallet';
import { inr } from '@/lib/wallet';
import PaymentStep from '@/components/provider/PaymentStep';

type Unpaid = { id: string; total_amount: number; customer_name: string | null; completed_at: string | null };

/** Stays on screen until every completed job has its payment recorded. */
export default function CollectPaymentBar() {
  const { provider } = useProvider();
  const { summary, refresh } = useWallet();
  const [jobs, setJobs] = useState<Unpaid[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!provider?.id || !summary?.live_since) return;
    const { data } = await (supabase as any)
      .from('bookings')
      .select('id, total_amount, customer_name, completed_at, payment_status')
      .eq('provider_id', provider.id)
      .eq('status', 'completed')
      .gte('completed_at', summary.live_since)
      .order('completed_at', { ascending: true });
    const rows = ((data ?? []) as Array<Unpaid & { payment_status: string | null }>)
      .filter((b) => b.payment_status !== 'paid' && Number(b.total_amount) > 0);
    setJobs(rows);
  }, [provider?.id, summary?.live_since]);

  useEffect(() => {
    void load();
    if (!provider?.id) return;
    const channel = supabase
      .channel(`unpaid-${provider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${provider.id}` }, () => void load())
      .subscribe();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [provider?.id, load]);

  if (jobs.length === 0 && !openId) return null;
  const first = jobs[0];

  return (
    <>
      {first && (
        <div className="fixed bottom-4 left-3 right-3 z-40 mx-auto max-w-md">
          <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-card p-3 shadow-2xl">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">
                Collect {inr(first.total_amount)}{first.customer_name ? ` from ${first.customer_name}` : ''}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {jobs.length > 1 ? `${jobs.length} completed jobs waiting for payment` : 'Job completed. Payment not recorded yet.'}
              </p>
            </div>
            <Button size="sm" className="gold-gradient text-primary-foreground font-bold rounded-xl" onClick={() => setOpenId(first.id)}>
              <Banknote className="h-4 w-4 mr-1" /> Collect
            </Button>
          </div>
        </div>
      )}
      <PaymentStep
        open={!!openId}
        bookingId={openId}
        onClose={() => { setOpenId(null); void load(); void refresh(); }}
        onPaid={() => { void load(); void refresh(); }}
      />
    </>
  );
}
