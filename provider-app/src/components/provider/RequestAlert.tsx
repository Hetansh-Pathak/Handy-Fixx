import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProvider } from '@/contexts/ProviderContext';
import { playRequestAlert } from '@/lib/alert';

const WINDOW_S = 30;

type Req = {
  id: string;
  total_amount: number | null;
  address: string | null;
  city: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  services: { name: string } | null;
};

/** Full-screen "new job" card with a 30s countdown ring. Ignoring it just leaves the booking pending. */
const RequestAlert = () => {
  const { provider } = useProvider();
  const navigate = useNavigate();
  const [req, setReq] = useState<Req | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const online = Boolean(provider?.is_online) && provider?.kyc_status === 'approved';

  const show = useCallback(async (id: string) => {
    if (seen.current.has(id)) return;
    seen.current.add(id);
    const { data } = await (supabase as any)
      .from('bookings')
      .select('id, status, total_amount, address, city, scheduled_date, scheduled_time, services(name)')
      .eq('id', id)
      .maybeSingle();
    if (data && data.status === 'pending') {
      setReq(data as Req);
      playRequestAlert();
    }
  }, []);

  useEffect(() => {
    if (!provider || !online) return;
    const channel = supabase
      .channel('request-alert')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings', filter: `provider_id=eq.${provider.id}` },
        (payload) => void show((payload.new as { id: string }).id))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [provider, online, show]);

  useEffect(() => {
    if (!req) return;
    const t = setTimeout(() => setReq(null), WINDOW_S * 1000);
    return () => clearTimeout(t);
  }, [req]);

  const accept = async () => {
    if (!req) return;
    await (supabase as any).from('bookings').update({ status: 'confirmed' }).eq('id', req.id);
    setReq(null);
    navigate('/provider-panel/bookings');
  };
  const decline = async () => {
    if (!req) return;
    await (supabase as any).from('bookings').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Declined by provider',
    }).eq('id', req.id);
    setReq(null);
  };

  const C = 2 * Math.PI * 54;
  return (
    <AnimatePresence>
      {req && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          className="fixed inset-0 z-[100] flex flex-col bg-primary px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-primary-foreground"
        >
          <p className="text-center text-sm font-bold uppercase tracking-widest text-gold">New job request</p>

          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="relative h-36 w-36">
              <svg viewBox="0 0 120 120" className="-rotate-90">
                <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="6" />
                <motion.circle
                  cx="60" cy="60" r="54" fill="none" stroke="hsl(43 96% 51%)" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={C}
                  initial={{ strokeDashoffset: 0 }}
                  animate={{ strokeDashoffset: C }}
                  transition={{ duration: WINDOW_S, ease: 'linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold">₹{Number(req.total_amount ?? 0).toLocaleString()}</span>
              </div>
            </div>
            <h1 className="mt-8 text-[32px] font-extrabold leading-tight tracking-tight">{req.services?.name ?? 'Service'}</h1>
            <p className="mt-3 flex items-center gap-1.5 text-[15px] opacity-80">
              <Clock className="h-4 w-4" />
              {req.scheduled_date ? new Date(req.scheduled_date).toLocaleDateString() : 'Today'}{req.scheduled_time ? ` · ${req.scheduled_time}` : ''}
            </p>
            <p className="mt-1.5 flex max-w-xs items-center gap-1.5 text-[15px] opacity-80">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{req.address || req.city || 'Address on accept'}</span>
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={decline} className="press h-16 flex-1 rounded-2xl bg-white/10 text-base font-bold">Decline</button>
            <button onClick={accept} className="press h-16 flex-[2] rounded-2xl bg-gold text-lg font-extrabold text-gold-foreground">Accept</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RequestAlert;
