import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProvider } from '@/contexts/ProviderContext';
import type { WalletSummary } from '@/lib/wallet';

/** Live wallet summary (balance, dues, block state). Refreshes when the ledger changes. */
export function useWallet() {
  const { provider } = useProvider();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!provider?.id) return;
    const { data, error } = await (supabase as any).rpc('get_wallet_summary');
    if (!error && data?.ok) setSummary(data as WalletSummary);
    setLoading(false);
  }, [provider?.id]);

  useEffect(() => {
    if (!provider?.id) return;
    void refresh();
    const channel = supabase
      .channel(`wallet-${provider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `provider_id=eq.${provider.id}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_payments', filter: `provider_id=eq.${provider.id}` }, () => void refresh())
      .subscribe();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [provider?.id, refresh]);

  return { summary, loading, refresh };
}
