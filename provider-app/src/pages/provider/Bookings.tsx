import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Check, ChevronRight, FileSearch, MapPin, MessageCircle, Phone, X } from 'lucide-react';
import { useProvider } from '@/contexts/ProviderContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import BookingChat from '@/components/provider/BookingChat';
import LockedPage from '@/components/provider/LockedPage';
import { ProblemDetailsDialog, useBookingAttachments } from '@/components/AttachmentViewer';
import {
  OPEN_JOB_EVENT, TAB_LABEL, TAB_ORDER, defaultTab, earningsOf, statusLabel, tabOf, toneOf, whenLabel,
  type Tone, type TabKey,
} from '@/lib/bookingView';

type Row = {
  id: string; status: string;
  booking_date: string | null; booking_time: string | null; scheduled_date: string | null; scheduled_time: string | null;
  address: string | null; city: string | null; pincode: string | null;
  total_amount: number | null; platform_fee: number | null; provider_amount: number | null;
  description: string | null; special_instructions: string | null; sub_item_name: string | null;
  customer_name: string | null; customer_phone: string | null;
  cancellation_reason: string | null; provider_eta_minutes: number | null;
  unread_messages_provider: number | null;
  services: { name: string } | null;
};

const SELECT = `id, status, booking_date, booking_time, scheduled_date, scheduled_time, address, city, pincode,
  total_amount, platform_fee, provider_amount, description, special_instructions, sub_item_name,
  customer_name, customer_phone, cancellation_reason, provider_eta_minutes, unread_messages_provider, services(name)`;

const TONE: Record<Tone, string> = {
  gold: 'bg-gold/15 text-gold-foreground ring-1 ring-gold/40',
  black: 'bg-primary text-primary-foreground',
  green: 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30',
  red: 'bg-red-500/10 text-red-600 ring-1 ring-red-500/30',
};
const BAR: Record<Tone, string> = { gold: 'bg-gold', black: 'bg-primary', green: 'bg-emerald-500', red: 'bg-red-500' };

const buzz = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };

function ProblemChip({ id, note, onOpen }: { id: string; note: string | null; onOpen: () => void }) {
  const { hasAudio, hasImages, attachments } = useBookingAttachments(id);
  if (!hasAudio && !hasImages && !note?.trim()) return null;
  const bits = [hasAudio && '🎤 Voice', hasImages && `📷 ${attachments.filter(a => a.type === 'image').length}`, note?.trim() && '📝 Note'].filter(Boolean);
  return (
    <button onClick={onOpen} className="press mt-3 flex w-full items-center gap-2 rounded-xl bg-secondary px-3 py-2.5 text-left">
      <FileSearch className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-sm font-semibold">Problem details</span>
      <span className="text-xs text-muted-foreground">{bits.join(' · ')}</span>
    </button>
  );
}

const Bookings = () => {
  const { provider } = useProvider();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<TabKey | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [declineId, setDeclineId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!provider?.id) return;
    const { data, error } = await (supabase as any).from('bookings').select(SELECT)
      .eq('provider_id', provider.id).order('created_at', { ascending: false });
    if (error) { setFailed(true); } else { setFailed(false); setRows((data ?? []) as Row[]); }
    setLoading(false);
  }, [provider?.id]);

  useEffect(() => {
    if (!provider?.id) return;
    void load();
    const ch = supabase.channel(`provider-bookings-list-${provider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${provider.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [provider?.id, load]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { new: 0, upcoming: 0, active: 0, done: 0, cancelled: 0 };
    rows.forEach(r => { c[tabOf(r.status)]++; });
    return c;
  }, [rows]);

  const current: TabKey = tab ?? defaultTab(counts);
  const list = useMemo(() => rows.filter(r => tabOf(r.status) === current), [rows, current]);

  const update = async (id: string, patch: Record<string, unknown>, ok: string) => {
    if (!provider) return;
    setBusy(id); buzz();
    // Guard on current status so two devices can't both act on the same request.
    const { data, error } = await (supabase as any).from('bookings').update(patch)
      .eq('id', id).eq('provider_id', provider.id).eq('status', 'pending').select('id');
    setBusy(null);
    if (error) toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    else if (!data?.length) { toast({ title: 'Already handled', description: 'This request was changed or cancelled.' }); void load(); }
    else { toast({ title: ok }); void load(); }
  };

  const accept = (id: string) => update(id, { status: 'confirmed' }, 'Accepted. Customer notified.');
  const decline = (id: string) => update(id, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'Declined by provider' }, 'Request declined');
  const openJob = () => window.dispatchEvent(new Event(OPEN_JOB_EVENT));

  if (provider && provider.kyc_status !== 'approved') return <LockedPage pageName="Bookings" />;

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="tablist">
        {TAB_ORDER.map(t => (
          <button key={t} role="tab" aria-selected={current === t} onClick={() => { buzz(6); setTab(t); }}
            className={cn('press relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors',
              current === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
            {TAB_LABEL[t]}
            {counts[t] > 0 && (
              <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold',
                current === t ? 'bg-gold text-gold-foreground' : t === 'new' ? 'bg-gold text-gold-foreground' : 'bg-background')}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-44 animate-pulse rounded-3xl bg-secondary" />)}</div>
      ) : failed ? (
        <div className="rounded-3xl bg-secondary p-8 text-center">
          <p className="font-bold">Couldn't load bookings</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <button onClick={() => { setLoading(true); void load(); }} className="press mt-4 h-11 rounded-xl bg-primary px-6 font-bold text-primary-foreground">Try again</button>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-3xl bg-secondary p-10 text-center">
          <p className="text-lg font-extrabold">{current === 'new' ? 'No new requests' : `Nothing in ${TAB_LABEL[current]}`}</p>
          <p className="mt-1 text-sm text-muted-foreground">{current === 'new' ? 'Stay online and requests will pop up instantly.' : 'Jobs show up here as they move along.'}</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((b, i) => {
            const tone = toneOf(b.status);
            const earn = earningsOf(b);
            const note = b.special_instructions || b.description;
            const place = [b.address, b.city, b.pincode].filter(Boolean).join(', ');
            const when = whenLabel(b.scheduled_date || b.booking_date, b.scheduled_time || b.booking_time);
            const unread = b.unread_messages_provider ?? 0;
            const live = b.status === 'confirmed' || b.status === 'on_the_way' || b.status === 'in_progress';
            return (
              <motion.article key={b.id} layout
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }}
                transition={{ type: 'spring', damping: 26, stiffness: 300, delay: Math.min(i, 5) * 0.04 }}
                className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border">
                <div className={cn('h-1.5', BAR[tone])} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-extrabold leading-tight">{b.services?.name ?? 'Service'}</h3>
                      {b.sub_item_name && <p className="truncate text-sm text-muted-foreground">{b.sub_item_name}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-extrabold">{earn != null ? `₹${earn.toLocaleString('en-IN')}` : '—'}</p>
                      <span className={cn('mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold', TONE[tone])}>
                        {statusLabel(b.status, b.provider_eta_minutes)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2"><Calendar className="h-4 w-4 shrink-0" /><span className="font-semibold text-foreground">{when}</span></p>
                    {place && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span className="line-clamp-2">{place}</span></p>}
                  </div>

                  {(b.customer_name || (b.customer_phone && live)) && (
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary px-3 py-2">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{(b.customer_name || 'C')[0].toUpperCase()}</span>
                        {b.customer_name || 'Customer'}
                      </span>
                      {b.customer_phone && live && (
                        <a href={`tel:${b.customer_phone}`} className="press flex h-9 items-center gap-1.5 rounded-full bg-background px-3 text-sm font-bold" aria-label="Call customer">
                          <Phone className="h-4 w-4" /> Call
                        </a>
                      )}
                    </div>
                  )}

                  <ProblemChip id={b.id} note={note} onOpen={() => setDetail(b)} />

                  {b.status === 'pending' && (
                    <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
                      <button disabled={busy === b.id} onClick={() => setDeclineId(b.id)}
                        className="press flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 disabled:opacity-50" aria-label="Decline request">
                        <X className="h-6 w-6" />
                      </button>
                      <button disabled={busy === b.id} onClick={() => accept(b.id)}
                        className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-gold text-base font-extrabold text-gold-foreground disabled:opacity-60">
                        {busy === b.id ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <><Check className="h-5 w-5" /> Accept request</>}
                      </button>
                    </div>
                  )}

                  {live && (
                    <div className="mt-4 flex gap-2">
                      <button onClick={openJob} className="press flex h-14 flex-1 items-center justify-center gap-1 rounded-2xl bg-primary text-base font-extrabold text-primary-foreground">
                        {b.status === 'confirmed' ? 'Start job flow' : 'Continue job'} <ChevronRight className="h-5 w-5" />
                      </button>
                      {user && (
                        <button onClick={() => setChatId(b.id)} aria-label="Chat with customer"
                          className="press relative flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
                          <MessageCircle className="h-6 w-6" />
                          {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-gold-foreground">{unread}</span>}
                        </button>
                      )}
                    </div>
                  )}

                  {b.status === 'completed' && <p className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-center text-sm font-bold text-emerald-700">Completed · {earn != null ? `₹${earn.toLocaleString('en-IN')} earned` : 'earned'}</p>}
                  {b.status === 'cancelled' && <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2.5 text-center text-sm font-semibold text-red-600">{b.cancellation_reason || 'Cancelled'}</p>}
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      )}

      {detail && (
        <ProblemDetailsDialog
          open onClose={() => setDetail(null)} bookingId={detail.id}
          note={detail.special_instructions || detail.description}
          serviceName={detail.services?.name} subItemName={detail.sub_item_name}
          shortId={detail.id.slice(0, 8).toUpperCase()}
          showActions={detail.status === 'pending'} actionLoading={busy === detail.id}
          onAccept={detail.status === 'pending' ? () => { void accept(detail.id); setDetail(null); } : undefined}
          onDecline={detail.status === 'pending' ? () => { setDeclineId(detail.id); setDetail(null); } : undefined}
        />
      )}

      <AlertDialog open={!!declineId} onOpenChange={o => !o && setDeclineId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this request?</AlertDialogTitle>
            <AlertDialogDescription>The customer will be told, and can book another pro.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (declineId) void decline(declineId); setDeclineId(null); }}>Decline</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {chatId && user && (
        <Dialog open onOpenChange={() => setChatId(null)}>
          <DialogContent className="max-w-md p-0">
            <DialogHeader className="border-b border-border p-4 pb-3"><DialogTitle>Chat with customer</DialogTitle></DialogHeader>
            <BookingChat bookingId={chatId} currentUserId={user.id} senderType="provider" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Bookings;
