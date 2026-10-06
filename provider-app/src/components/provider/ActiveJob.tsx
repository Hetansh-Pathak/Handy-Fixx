import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ChevronRight, MapPin, Navigation, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProvider } from '@/contexts/ProviderContext';
import { useToast } from '@/hooks/use-toast';
import CompleteJobDialog from '@/components/provider/CompleteJobDialog';
import { OPEN_JOB_EVENT } from '@/lib/bookingView';

type Job = {
  id: string;
  status: 'confirmed' | 'on_the_way' | 'in_progress';
  address: string | null;
  city: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount: number | null;
  provider_amount: number | null;
  provider_eta_minutes: number | null;
  services: { name: string } | null;
};

const SELECT =
  'id, status, address, city, pincode, latitude, longitude, customer_name, customer_phone, total_amount, provider_amount, provider_eta_minutes, services(name)';

/** Step model. "Arrived" is stored as provider_eta_minutes = 0 while status is on_the_way (no schema change needed). */
const stepOf = (j: Job) => (j.status === 'confirmed' ? 0 : j.status === 'in_progress' ? 3 : j.provider_eta_minutes === 0 ? 2 : 1);
const COPY = [
  { title: 'Head to the customer', cta: 'Start trip' },
  { title: 'On the way', cta: "I've arrived" },
  { title: 'Ready to begin', cta: 'Start job' },
  { title: 'Work in progress', cta: 'Enter customer code' },
];

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** Always-on current-job bar + full-screen job sheet. Lives in the layout, so live location survives page changes. */
const ActiveJob = () => {
  const { provider } = useProvider();
  const { user } = useAuth();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const lastEta = useRef(0);

  const load = useCallback(async () => {
    if (!provider) return;
    const { data } = await (supabase as any)
      .from('bookings').select(SELECT)
      .eq('provider_id', provider.id)
      .in('status', ['confirmed', 'on_the_way', 'in_progress'])
      .order('scheduled_date', { ascending: true }).limit(1);
    setJob((data?.[0] as Job) ?? null);
  }, [provider]);

  useEffect(() => {
    if (!provider) return;
    void load();
    const ch = supabase.channel('active-job')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${provider.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [provider, load]);

  // Bookings page asks the sheet to open.
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener(OPEN_JOB_EVENT, h);
    return () => window.removeEventListener(OPEN_JOB_EVENT, h);
  }, []);

  // Live location: runs only while the trip is active, also resumes after an app reload.
  const jobId = job?.id, tracking = job?.status === 'on_the_way' && job.provider_eta_minutes !== 0;
  const dest = job?.latitude != null && job?.longitude != null ? [job.latitude, job.longitude] as const : null;
  useEffect(() => {
    if (!jobId || !user || job?.status !== 'on_the_way' || !navigator.geolocation) return;
    let lastSent = 0;
    const id = navigator.geolocation.watchPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      // watchPosition can fire every second; one write per 8s is plenty for a live map and spares the database.
      if (Date.now() - lastSent < 8_000) return;
      lastSent = Date.now();
      const { error: locErr } = await (supabase as any).from('provider_locations').upsert(
        { booking_id: jobId, provider_id: user.id, latitude, longitude, updated_at: new Date().toISOString() },
        { onConflict: 'booking_id' });
      if (locErr) console.error('[ActiveJob] location upload failed:', locErr.message);
      if (tracking && dest && Date.now() - lastEta.current > 30_000) {
        lastEta.current = Date.now();
        const eta = Math.max(1, Math.round((km(latitude, longitude, dest[0], dest[1]) / 25) * 60)); // ~25 km/h city pace
        await (supabase as any).from('bookings').update({ provider_eta_minutes: eta }).eq('id', jobId);
      }
    }, () => toast({ title: 'Location off', description: 'Allow location so the customer can track you.', variant: 'destructive' }),
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 });
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, job?.status, tracking, user?.id]);

  const advance = async () => {
    if (!job || !provider) return;
    const step = stepOf(job);
    if (step === 3) { setCodeOpen(true); return; }
    const updates =
      step === 0 ? { status: 'on_the_way', provider_departed_at: new Date().toISOString(), provider_eta_minutes: 20 }
      : step === 1 ? { provider_eta_minutes: 0 }
      : { status: 'in_progress', started_at: new Date().toISOString() };
    setBusy(true);
    try { navigator.vibrate?.(12); } catch { /* noop */ }
    const { error } = await (supabase as any).from('bookings').update(updates).eq('id', job.id).eq('provider_id', provider.id);
    setBusy(false);
    if (error) toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    else await load();
  };

  if (!job && done === null) return null;
  const step = job ? stepOf(job) : 0;
  const place = job ? [job.address, job.city, job.pincode].filter(Boolean).join(', ') : '';
  const mapsUrl = job && dest ? `https://www.google.com/maps/dir/?api=1&destination=${dest[0]},${dest[1]}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

  return (
    <>
      {/* Floating current-job bar */}
      {job && !open && (
        <motion.button
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          onClick={() => setOpen(true)}
          className="press fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-left text-primary-foreground shadow-xl lg:bottom-6 lg:left-auto lg:right-6 lg:w-96"
        >
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-gold" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{job.services?.name ?? 'Current job'}</span>
            <span className="block truncate text-xs opacity-70">{COPY[step].title}</span>
          </span>
          <span className="flex items-center gap-1 text-sm font-bold text-gold">Open <ChevronRight className="h-4 w-4" /></span>
        </motion.button>
      )}

      {/* Full-screen job sheet */}
      <AnimatePresence>
        {job && open && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, i) => { if (i.offset.y > 120) setOpen(false); }}
            className="fixed inset-0 z-[90] flex flex-col bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]"
          >
            <button onClick={() => setOpen(false)} aria-label="Minimise" className="press mx-auto flex h-10 w-16 items-center justify-center rounded-full text-muted-foreground">
              <ChevronDown className="h-6 w-6" />
            </button>

            <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-y-auto">
              <div className="mt-2 flex gap-1.5">
                {COPY.map((_, i) => (
                  <motion.div key={i} className="h-1.5 flex-1 rounded-full bg-secondary" >
                    <motion.div className="h-full rounded-full bg-gold" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
                  </motion.div>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="mt-8">
                  <p className="text-sm font-semibold text-muted-foreground">{job.services?.name}</p>
                  <h1 className="mt-1 text-[32px] font-extrabold leading-tight tracking-tight">{COPY[step].title}</h1>
                  {step === 1 && job.provider_eta_minutes ? <p className="mt-1 text-muted-foreground">About {job.provider_eta_minutes} min away · sharing live location</p> : null}
                  {step === 3 && <p className="mt-1 text-muted-foreground">Ask the customer for their 4-digit code once the work is finished.</p>}
                </motion.div>
              </AnimatePresence>

              <div className="mt-8 rounded-3xl bg-secondary p-5">
                <p className="text-lg font-extrabold">{job.customer_name || 'Customer'}</p>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{place || 'Address not provided'}</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                    <Navigation className="h-4 w-4" /> Navigate
                  </a>
                  {job.customer_phone ? (
                    <a href={`tel:${job.customer_phone}`} className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-background text-sm font-bold">
                      <Phone className="h-4 w-4" /> Call
                    </a>
                  ) : <span className="flex h-12 items-center justify-center rounded-xl bg-background text-sm text-muted-foreground">No phone</span>}
                </div>
              </div>
              <p className="mt-4 text-center text-sm text-muted-foreground">You earn ₹{Number(job.provider_amount ?? job.total_amount ?? 0).toLocaleString()} for this job</p>
            </div>

            <div className="mx-auto w-full max-w-lg pt-4">
              <button
                onClick={advance}
                disabled={busy}
                className={`press flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-extrabold disabled:opacity-60 ${step === 3 ? 'bg-gold text-gold-foreground' : 'bg-primary text-primary-foreground'}`}
              >
                {busy && <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                {COPY[step].cta}
              </button>
              {step === 0 && (
                <button onClick={async () => { setBusy(true); await (supabase as any).from('bookings').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', job.id).eq('provider_id', provider!.id); setBusy(false); void load(); }} className="press mt-2 h-10 w-full text-sm font-semibold text-muted-foreground">
                  Already on site? Start job now
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {job && (
        <CompleteJobDialog
          open={codeOpen}
          bookingId={job.id}
          onClose={() => setCodeOpen(false)}
          onCompleted={() => { setDone(Number(job.provider_amount ?? job.total_amount ?? 0)); setOpen(false); void load(); setTimeout(() => setDone(null), 2800); }}
        />
      )}

      {/* Completion moment */}
      <AnimatePresence>
        {done !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-emerald-600 text-white">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 16 }} className="flex h-28 w-28 items-center justify-center rounded-full bg-white/20">
              <Check className="h-14 w-14" strokeWidth={3} />
            </motion.span>
            <h2 className="mt-6 text-3xl font-extrabold">Job complete</h2>
            <p className="mt-1 text-lg opacity-90">₹{done.toLocaleString()} added to earnings</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ActiveJob;
