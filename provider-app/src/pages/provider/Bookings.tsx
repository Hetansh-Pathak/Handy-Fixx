import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Clock, MapPin, CheckCircle, XCircle, Play, Flag,
  Phone, AlertCircle, MessageCircle, Car, Paperclip, FileSearch
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useProvider } from '@/contexts/ProviderContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import BookingChat from '@/components/provider/BookingChat';
import LiveMap from '@/components/LiveMap';
import { cn } from '@/lib/utils';
import AttachmentViewer, {
  useBookingAttachments,
  AttachmentBadges,
  ProblemDetailsDialog,
  type RawAttachment,
} from '@/components/AttachmentViewer';
import CompleteJobDialog from '@/components/provider/CompleteJobDialog';
import LockedPage from '@/components/provider/LockedPage';

type BookingStatus = 'pending' | 'confirmed' | 'on_the_way' | 'in_progress' | 'completed' | 'cancelled';

// ── Provider location mini-map ─────────────────────────────────────────────────
const ProviderBookingMap = ({ bookingId, status, latitude, longitude }: {
  bookingId: string;
  status: BookingStatus;
  latitude: number;
  longitude: number;
}) => {
  const [providerLocation, setProviderLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (status !== 'on_the_way') return;
    const loadLocation = async () => {
      const { data } = await (supabase as any)
        .from('provider_locations')
        .select('latitude, longitude')
        .eq('booking_id', bookingId)
        .maybeSingle();
      if (data) setProviderLocation(data);
    };
    loadLocation();
    const channel = supabase.channel(`provider-own-location-${bookingId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'provider_locations', filter: `booking_id=eq.${bookingId}`,
      }, (payload) => {
        const newLoc = payload.new as { latitude?: number; longitude?: number } | null;
        if (newLoc && typeof newLoc.latitude === 'number' && typeof newLoc.longitude === 'number') {
          setProviderLocation({ latitude: newLoc.latitude, longitude: newLoc.longitude });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId, status]);

  return (
    <div className="mb-3">
      <LiveMap
        height="180px"
        markers={[
          { latitude, longitude, label: 'Customer service location', color: 'gold' },
          ...(providerLocation ? [{ ...providerLocation, label: 'Your live location', color: 'blue' as const }] : []),
        ]}
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        {providerLocation ? 'Your live location is updating' : 'Waiting for your first location update...'}
      </p>
    </div>
  );
};

// ── Status styles ─────────────────────────────────────────────────────────────
const statusStyles: Record<BookingStatus, string> = {
  pending:     'bg-warning/20 text-warning border border-warning/20',
  confirmed:   'bg-primary/20 text-primary border border-primary/20',
  on_the_way:  'bg-orange-500/20 text-orange-400 border border-orange-500/20',
  in_progress: 'bg-blue-500/20 text-blue-400 border border-blue-500/20',
  completed:   'bg-success/20 text-success border border-success/20',
  cancelled:   'bg-destructive/20 text-destructive border border-destructive/20',
};

const statusBarColor: Record<BookingStatus, string> = {
  pending:     'bg-warning',
  confirmed:   'bg-primary',
  on_the_way:  'bg-orange-500',
  in_progress: 'bg-blue-500',
  completed:   'bg-success',
  cancelled:   'bg-destructive',
};

// ── Attachment badge (row-only, no signed URLs needed) ────────────────────────
function AttachmentBadgeRow({
  bookingId,
  note,
  onViewDetails,
}: {
  bookingId: string;
  note?: string | null;
  onViewDetails: () => void;
}) {
  const { attachments, hasAudio, hasImages } = useBookingAttachments(bookingId);
  const hasNote = Boolean(note?.trim());
  const imageCount = attachments.filter((a: RawAttachment) => a.type === 'image').length;
  const hasAnything = hasAudio || hasImages || hasNote;

  if (!hasAnything) {
    return (
      <p className="text-xs text-muted-foreground/60 italic">
        Customer didn't add problem details
      </p>
    );
  }

  const badgeParts: string[] = [];
  if (hasAudio) badgeParts.push('🎤 1');
  if (hasImages) badgeParts.push(`📷 ${imageCount}`);
  if (hasNote) badgeParts.push('📝 Note');

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="w-full border-primary/25 text-primary hover:bg-primary/10 rounded-xl gap-2 justify-start"
      onClick={onViewDetails}
      aria-label="View customer problem details"
    >
      <FileSearch className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left text-xs font-medium">View Problem Details</span>
      <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
        {badgeParts.join(' · ')}
      </span>
    </Button>
  );
}

// ── Main Bookings component ───────────────────────────────────────────────────
const Bookings = () => {
  const { provider } = useProvider();
  const { user } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeChatBookingId, setActiveChatBookingId] = useState<string | null>(null);
  const watchIds = useRef<Record<string, number>>({});
  const [locationSharing, setLocationSharing] = useState<Record<string, { loading: boolean; approximate: boolean }>>({});

  // Feature 1: Problem details dialog state
  const [problemDetailsBooking, setProblemDetailsBooking] = useState<any | null>(null);

  // Feature 2: Complete job dialog state
  const [completeDialogBookingId, setCompleteDialogBookingId] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    if (!provider?.id) return;

    const { data, error } = await (supabase as any)
      .from('bookings')
      .select(`
        id, status,
        booking_date, booking_time,
        scheduled_date, scheduled_time,
        address, city, pincode, latitude, longitude,
        total_amount, platform_fee, provider_amount,
        description, special_instructions, sub_item_id, sub_item_name,
        customer_name, customer_phone, created_at,
        cancelled_at, cancellation_reason, started_at, completed_at,
        provider_departed_at, provider_eta_minutes,
        unread_messages_provider,
        services(id, name, icon, slug)
      `)
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false });

    let enrichedData = data || [];
    try {
      const { data: extra } = await (supabase as any)
        .from('bookings')
        .select('id, provider_amount, description, special_instructions, sub_item_id, sub_item_name')
        .eq('provider_id', provider.id);

      if (extra) {
        const extraMap: Record<string, any> = {};
        extra.forEach((e: any) => { extraMap[e.id] = e; });
        enrichedData = enrichedData.map((b: any) => ({ ...b, ...extraMap[b.id] }));
      }
    } catch {
      // New columns not yet added — safe to ignore
    }

    if (error) {
      console.error('Bookings fetch error:', error);
      toast({ title: 'Could not load bookings', description: error.message, variant: 'destructive' });
    } else {
      setBookings(enrichedData);
    }
    setLoading(false);
  }, [provider?.id]);

  useEffect(() => {
    if (!provider?.id) return;
    fetchBookings();

    // Realtime: booking changes
    const channel = supabase
      .channel(`bookings-provider-${provider.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `provider_id=eq.${provider.id}`,
      }, (payload) => {
        console.log('📬 Booking change:', payload);
        fetchBookings();
      })
      .subscribe((status) => {
        console.log('🔌 Bookings realtime:', status);
      });

    return () => { supabase.removeChannel(channel); };
  }, [provider?.id, fetchBookings]);

  // Feature 1 Realtime: attachment rows — refetch raw attachment cache 1.5s after new booking
  useEffect(() => {
    if (!provider?.id) return;
    const attChannel = supabase
      .channel(`att-inserts-${provider.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_attachments',
      }, () => {
        // Force badge refresh — cache is cleared in the hook refetch
        // Let React re-render naturally, the badge hook will re-query
      })
      .subscribe();
    return () => { supabase.removeChannel(attChannel); };
  }, [provider?.id]);

  const stopLocationSharing = useCallback((bookingId: string) => {
    const watchId = watchIds.current[bookingId];
    if (watchId !== undefined) {
      navigator.geolocation.clearWatch(watchId);
      delete watchIds.current[bookingId];
    }
  }, []);

  useEffect(() => {
    bookings.forEach((booking) => {
      if (!['on_the_way'].includes(booking.status)) stopLocationSharing(booking.id);
    });
    return () => Object.keys(watchIds.current).forEach(stopLocationSharing);
  }, [bookings, stopLocationSharing]);

  const doAction = async (
    bookingId: string,
    updates: Record<string, any>,
    successMsg: string,
  ) => {
    setActionLoading(bookingId);
    const { error } = await (supabase as any)
      .from('bookings')
      .update(updates)
      .eq('id', bookingId)
      .eq('provider_id', provider!.id);

    if (error) {
      console.error('doAction error:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: successMsg });
      await fetchBookings();
    }
    setActionLoading(null);
  };

  const accept = (id: string) =>
    doAction(id, { status: 'confirmed' }, '✅ Booking Accepted — Customer notified!');

  const decline = async (id: string) => {
    stopLocationSharing(id);
    await doAction(id, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'Declined by provider',
    }, 'Booking declined');
  };

  const startLocationSharing = (bookingId: string) => {
    if (!navigator.geolocation) {
      toast({ title: 'Location unavailable', description: 'This browser does not support live location sharing.', variant: 'destructive' });
      return;
    }
    stopLocationSharing(bookingId);
    setLocationSharing((current) => ({ ...current, [bookingId]: { loading: true, approximate: false } }));
    const watchId = navigator.geolocation.watchPosition(async (position) => {
      setLocationSharing((current) => ({
        ...current,
        [bookingId]: { loading: false, approximate: position.coords.accuracy > 100 },
      }));
      const { error } = await (supabase as any).from('provider_locations').upsert({
        booking_id: bookingId,
        provider_id: user?.id,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'booking_id' });
      if (error) console.error('Provider location update failed:', error.message);
    }, () => {
      setLocationSharing((current) => ({ ...current, [bookingId]: { loading: false, approximate: false } }));
      toast({ title: 'Location permission denied', description: 'Enable location permission to share your live position.', variant: 'destructive' });
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    watchIds.current[bookingId] = watchId;
  };

  const onMyWay = async (id: string) => {
    await doAction(id, {
      status: 'on_the_way',
      provider_departed_at: new Date().toISOString(),
      provider_eta_minutes: 20,
    }, '🚗 Customer notified you are on the way!');
    startLocationSharing(id);
  };

  const startJob = async (id: string) => {
    stopLocationSharing(id);
    await doAction(id, {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    }, '🚀 Job started — Customer notified');
  };

  // Tab-to-status mapping
  const filtered = bookings.filter(b => {
    if (tab === 'pending')   return b.status === 'pending';
    if (tab === 'confirmed') return ['confirmed', 'on_the_way'].includes(b.status);
    if (tab === 'active')    return ['on_the_way', 'in_progress'].includes(b.status);
    if (tab === 'completed') return b.status === 'completed';
    if (tab === 'cancelled') return b.status === 'cancelled';
    return true;
  });

  const counts = {
    pending:   bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => ['confirmed', 'on_the_way'].includes(b.status)).length,
    active:    bookings.filter(b => ['on_the_way', 'in_progress'].includes(b.status)).length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  };

  const tabs = [
    { value: 'pending',   label: 'New',       count: counts.pending   },
    { value: 'confirmed', label: 'Upcoming',  count: counts.confirmed },
    { value: 'active',    label: 'Active',    count: counts.active    },
    { value: 'completed', label: 'Done',      count: counts.completed },
    { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ];

  if (provider?.kyc_status !== 'approved') {
    return <LockedPage pageName="Bookings" />;
  }

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      {/* Tab bar */}
      <div className="bg-secondary w-full grid grid-cols-5 gap-1 p-1 rounded-xl">
        {tabs.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              'relative text-xs py-2 font-medium rounded-lg transition-colors text-center flex items-center justify-center',
              tab === t.value
                ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className="absolute -top-1 -right-1 bg-warning text-warning-foreground text-[8px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center leading-none">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-48 glass-card rounded-2xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 glass-card rounded-2xl">
            <div className="text-4xl mb-3">
              {tab === 'pending' ? '🔔' : tab === 'completed' ? '✅' : tab === 'cancelled' ? '❌' : '📅'}
            </div>
            <p className="text-muted-foreground font-medium">No {tab} bookings</p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === 'pending' ? 'New booking requests will appear here instantly' : 'Check other tabs'}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map((booking, i) => {
              const status = booking.status as BookingStatus;
              const isLoading = actionLoading === booking.id;
              const serviceName = booking.services?.name ?? 'Service';
              const subItemName = booking.sub_item_name;
              const alreadyDeparted = !!booking.provider_departed_at;
              const canChat = ['confirmed', 'on_the_way', 'in_progress'].includes(status);
              const unread = booking.unread_messages_provider ?? 0;
              const bookingDate = booking.scheduled_date || booking.booking_date;
              const bookingTime = booking.scheduled_time || booking.booking_time;
              const earnings = booking.provider_amount
                ?? (booking.total_amount && booking.platform_fee
                    ? booking.total_amount - booking.platform_fee
                    : booking.total_amount);
              const note = booking.special_instructions || booking.description;
              const shortId = booking.id.slice(0, 8).toUpperCase();

              return (
                <motion.div
                  key={booking.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="glass-card rounded-2xl overflow-hidden border-border">
                    {/* Status colour bar */}
                    <div className={cn('h-1.5', statusBarColor[status])} />

                    <CardContent className="p-4">
                      {/* Header row */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-foreground">{serviceName}</p>
                          {subItemName && (
                            <p className="text-xs text-primary font-medium">→ {subItemName}</p>
                          )}
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            #{shortId}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-extrabold text-primary">
                            ₹{earnings ?? '—'}
                          </p>
                          <Badge className={cn('text-xs mt-1', statusStyles[status])}>
                            {status.replace('_', ' ')}
                          </Badge>
                          {/* Attachment badge (row-only) */}
                          <div className="mt-1 flex justify-end">
                            <AttachmentBadges
                              hasAudio={false}
                              hasImages={false}
                              imageCount={0}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Date / time / address */}
                      <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
                        {bookingDate && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            {new Date(bookingDate).toLocaleDateString('en-IN', {
                              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                            })}
                            {bookingTime && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <Clock className="h-3.5 w-3.5" />
                                {bookingTime.slice(0, 5)}
                              </>
                            )}
                          </div>
                        )}
                        {booking.address && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <a
                              href={`https://maps.google.com/?q=${encodeURIComponent(booking.address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-primary transition-colors truncate"
                            >
                              {booking.address}{booking.city ? `, ${booking.city}` : ''} — {booking.pincode}
                            </a>
                          </div>
                        )}
                      </div>

                      {booking.latitude != null && booking.longitude != null && (
                        <div className="mb-3">
                          {status === 'on_the_way' ? (
                            <>
                              <ProviderBookingMap
                                bookingId={booking.id}
                                status={status}
                                latitude={booking.latitude}
                                longitude={booking.longitude}
                              />
                              {locationSharing[booking.id]?.loading && (
                                <p className="mt-1 text-[11px] text-muted-foreground">Waiting for a fresh GPS fix...</p>
                              )}
                              {locationSharing[booking.id]?.approximate && (
                                <p className="mt-1 text-[11px] text-amber-400">Location may be approximate.</p>
                              )}
                            </>
                          ) : (
                            <>
                              <LiveMap
                                height="180px"
                                markers={[{
                                  latitude: booking.latitude,
                                  longitude: booking.longitude,
                                  label: 'Customer service location',
                                }]}
                              />
                              <p className="mt-1 text-[11px] text-muted-foreground">Customer location preview</p>
                            </>
                          )}
                        </div>
                      )}

                      {/* Customer info */}
                      {(booking.customer_name || booking.customer_phone) && (
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/50 mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                              {(booking.customer_name || 'C')[0].toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-foreground">
                              {booking.customer_name || 'Customer'}
                            </span>
                          </div>
                          {booking.customer_phone && ['confirmed', 'in_progress'].includes(status) && (
                            <a
                              href={`tel:${booking.customer_phone}`}
                              className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                            >
                              <Phone className="h-3 w-3" /> Call
                            </a>
                          )}
                        </div>
                      )}

                      {/* Price breakdown */}
                      {booking.total_amount && (
                        <div className="flex justify-between text-xs text-muted-foreground mb-3 px-1">
                          <span>Customer pays: <span className="text-foreground font-medium">₹{booking.total_amount}</span></span>
                          <span>·</span>
                          <span>Platform: <span className="text-foreground font-medium">₹{booking.platform_fee ?? 49}</span></span>
                          <span>·</span>
                          <span>You earn: <span className="text-primary font-bold">₹{earnings}</span></span>
                        </div>
                      )}

                      {/* Special instructions (text) */}
                      {note && (
                        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-warning/5 border border-warning/20 mb-3">
                          <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                          <p className="text-xs text-warning">{note}</p>
                        </div>
                      )}

                      {/* ── Feature 1: View Problem Details button ── */}
                      <div className="mb-3">
                        <AttachmentBadgeRow
                          bookingId={booking.id}
                          note={note}
                          onViewDetails={() => setProblemDetailsBooking(booking)}
                        />
                      </div>

                      {/* ═══════════ ACTION BUTTONS ═══════════ */}
                      <div className="flex flex-col gap-2">

                        {/* PENDING: Accept + Decline */}
                        {status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive/30 text-destructive hover:bg-destructive/10 rounded-xl px-3 shrink-0"
                              onClick={() => decline(booking.id)}
                              disabled={isLoading}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Decline
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 gold-gradient text-primary-foreground font-bold rounded-xl h-10"
                              onClick={() => accept(booking.id)}
                              disabled={isLoading}
                            >
                              {isLoading ? (
                                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <><CheckCircle className="h-4 w-4 mr-1.5" /> Accept Booking</>
                              )}
                            </Button>
                          </div>
                        )}

                        {/* CONFIRMED / ON_THE_WAY */}
                        {(status === 'confirmed' || status === 'on_the_way') && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn(
                                'flex-1 rounded-xl',
                                alreadyDeparted || status === 'on_the_way'
                                  ? 'border-blue-500/20 text-blue-400/50 cursor-default'
                                  : 'border-blue-500/30 text-blue-400 hover:bg-blue-500/10',
                              )}
                              onClick={() => !alreadyDeparted && status !== 'on_the_way' && onMyWay(booking.id)}
                              disabled={alreadyDeparted || status === 'on_the_way' || isLoading}
                            >
                              <Car className="h-4 w-4 mr-1" />
                              {alreadyDeparted || status === 'on_the_way' ? 'Sharing location ✓' : "I'm On My Way"}
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl"
                              onClick={() => startJob(booking.id)}
                              disabled={isLoading}
                            >
                              <Play className="h-4 w-4 mr-1" /> Start Job
                            </Button>
                          </div>
                        )}

                        {/* IN PROGRESS: Mark Complete (opens OTP dialog) */}
                        {status === 'in_progress' && (
                          <Button
                            className="w-full bg-success hover:bg-success/90 text-success-foreground font-bold rounded-xl h-11"
                            onClick={() => setCompleteDialogBookingId(booking.id)}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <div className="w-4 h-4 border-2 border-success-foreground border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <><Flag className="h-4 w-4 mr-1.5" /> Mark as Completed</>
                            )}
                          </Button>
                        )}

                        {/* COMPLETED */}
                        {status === 'completed' && (
                          <div className="text-center p-2 rounded-xl bg-success/5 border border-success/20">
                            <p className="text-xs text-success">
                              ✅ Completed · ₹{earnings} earned
                            </p>
                          </div>
                        )}

                        {/* CANCELLED */}
                        {status === 'cancelled' && booking.cancellation_reason && (
                          <div className="text-center p-2 rounded-xl bg-destructive/5 border border-destructive/20">
                            <p className="text-xs text-destructive">{booking.cancellation_reason}</p>
                          </div>
                        )}

                        {/* Chat button */}
                        {canChat && user && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              'w-full border-primary/30 text-primary hover:bg-primary/10 rounded-xl relative',
                              unread > 0 && 'border-primary bg-primary/10',
                            )}
                            onClick={() => setActiveChatBookingId(booking.id)}
                          >
                            <MessageCircle className="h-4 w-4 mr-1.5" />
                            Chat with Customer
                            {unread > 0 && (
                              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                                {unread}
                              </span>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* ── Problem Details Dialog (Feature 1) ── */}
      {problemDetailsBooking && (
        <ProblemDetailsDialog
          open={!!problemDetailsBooking}
          onClose={() => setProblemDetailsBooking(null)}
          bookingId={problemDetailsBooking.id}
          note={problemDetailsBooking.special_instructions || problemDetailsBooking.description}
          serviceName={problemDetailsBooking.services?.name}
          subItemName={problemDetailsBooking.sub_item_name}
          shortId={problemDetailsBooking.id.slice(0, 8).toUpperCase()}
          showActions={problemDetailsBooking.status === 'pending'}
          actionLoading={actionLoading === problemDetailsBooking.id}
          onAccept={problemDetailsBooking.status === 'pending' ? () => accept(problemDetailsBooking.id) : undefined}
          onDecline={problemDetailsBooking.status === 'pending' ? () => decline(problemDetailsBooking.id) : undefined}
        />
      )}

      {/* ── Complete Job Dialog (Feature 2) ── */}
      {completeDialogBookingId && (
        <CompleteJobDialog
          open={!!completeDialogBookingId}
          bookingId={completeDialogBookingId}
          onClose={() => setCompleteDialogBookingId(null)}
          onCompleted={fetchBookings}
        />
      )}

      {/* ── Chat Dialog ── */}
      {activeChatBookingId && user && (
        <Dialog open={!!activeChatBookingId} onOpenChange={() => setActiveChatBookingId(null)}>
          <DialogContent className="bg-card border-border p-0 max-w-md">
            <DialogHeader className="p-4 pb-0 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <MessageCircle className="w-5 h-5 text-primary" />
                Chat with Customer
              </DialogTitle>
            </DialogHeader>
            <BookingChat
              bookingId={activeChatBookingId}
              currentUserId={user.id}
              senderType="provider"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Bookings;
