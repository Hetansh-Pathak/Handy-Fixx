import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Phone, ArrowRight, Home, MessageCircle, Star, Copy, Info } from "lucide-react";
import PayCard from "@/components/payments/PayCard";
import { motion } from "framer-motion";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import BookingChat from "@/components/BookingChat";
import StatusHero from "@/components/service/StatusHero";
import TrackingMap from "@/components/service/TrackingMap";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import AttachmentViewer from "@/components/AttachmentViewer";

type BookingDetails = {
  id: string;
  status: string | null;
  created_at?: string | null;
  booking_date: string;
  booking_time: string;
  scheduled_date?: string;
  scheduled_time?: string;
  address: string;
  city: string | null;
  pincode: string;
  total_amount: number | null;
  payment_status?: string | null;
  provider_id: string | null;
  provider_departed_at: string | null;
  provider_eta_minutes: number | null;
  cancellation_reason?: string | null;
  special_instructions?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  services: { name: string; slug: string | null } | null;
  service_providers: { full_name: string | null; name: string | null; rating: number | null; phone: string | null } | null;
};

// ── Completion Code Card ───────────────────────────────────────────────────────
function CompletionCodeCard({ bookingId }: { bookingId: string }) {
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: { code: string } | null; error: { message: string } | null }>;
            };
          };
        };
      }).from('booking_completion_codes').select('code').eq('booking_id', bookingId).maybeSingle();
      if (cancelled) return;
      if (error) console.error('[CompletionCodeCard] fetch error:', error.message);
      setCode(data?.code ?? null);
      setLoading(false);
    };
    void fetch();
    return () => { cancelled = true; };
  }, [bookingId]);

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast({ title: 'Code copied!' });
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="h-24 bg-secondary rounded-2xl animate-pulse" />;
  if (!code) return null;

  return (
    <div className="rounded-3xl bg-primary p-5 text-primary-foreground">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold">Your completion code</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rounded-full p-1 opacity-70" aria-label="What is this?"><Info className="h-4 w-4" /></button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              Share this code with your provider <strong>only after the work is finished</strong> to your satisfaction.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-2.5">
          {code.split('').map((digit, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i, duration: 0.35 }}
              className="flex h-16 flex-1 items-center justify-center rounded-2xl bg-white/10 text-3xl font-extrabold text-gold"
            >
              {digit}
            </motion.div>
          ))}
        </div>
        <button type="button" onClick={() => void copyCode()} className="press flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10" aria-label="Copy completion code">
          {copied ? <CheckCircle2 className="h-5 w-5 text-gold" /> : <Copy className="h-5 w-5" />}
        </button>
      </div>
      <p className="mt-4 text-xs leading-relaxed opacity-70">Only share this once the job is finished and you're happy with it.</p>
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1 justify-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="press p-0.5"
        >
          <Star
            className={`w-9 h-9 transition-colors ${
              star <= (hovered || value) ? "text-gold fill-gold" : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

const BookingConfirmation = () => {
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  // Auto-open chat when coming from ?chat=1 notification deep-link
  const autoOpenChat = searchParams.get('chat') === '1';
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [toastShown, setToastShown] = useState(false);
  const [showChat, setShowChat] = useState(autoOpenChat);
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [hasReview, setHasReview] = useState(false);

  // Status display config — Uber-style
  const statusDisplay = {
    pending: {
      icon: '⏳',
      iconBg: 'bg-warning/10 border-warning/30',
      title: 'Request Sent!',
      subtitle: 'Waiting for the provider to accept your booking...',
      titleColor: 'text-foreground',
    },
    confirmed: {
      icon: '✅',
      iconBg: 'bg-green-500/10 border-green-500/30',
      title: 'Booking Confirmed!',
      subtitle: 'Your provider has accepted the booking.',
      titleColor: 'text-green-400',
    },
    in_progress: {
      icon: '🚀',
      iconBg: 'bg-blue-500/10 border-blue-500/30',
      title: 'Service In Progress',
      subtitle: 'Your provider has started the work.',
      titleColor: 'text-blue-400',
    },
    completed: {
      icon: '🎉',
      iconBg: 'bg-green-500/10 border-green-500/30',
      title: 'Service Completed!',
      subtitle: 'We hope you loved the service.',
      titleColor: 'text-green-400',
    },
    cancelled: {
      icon: '❌',
      iconBg: 'bg-destructive/10 border-destructive/30',
      title: 'Booking Not Confirmed',
      subtitle: 'The provider could not accept this request.',
      titleColor: 'text-destructive',
    },
  };

  const fetchBooking = async () => {
    if (!bookingId) return;
    const { data } = await supabase
      .from("bookings")
      .select("id, status, created_at, booking_date, booking_time, scheduled_date, scheduled_time, address, city, pincode, latitude, longitude, total_amount, payment_status, provider_id, provider_departed_at, provider_eta_minutes, cancellation_reason, special_instructions, description, services(name, slug)")
      .eq("id", bookingId)
      .single();
    if (!data) { setBooking(null); return; }
    // Customers cannot read service_providers directly; booking_provider_info returns just this booking's pro.
    const { data: pro } = await (supabase as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } } };
    }).from("booking_provider_info").select("full_name, name, rating, phone").eq("booking_id", bookingId).maybeSingle();
    setBooking({ ...(data as object), service_providers: pro ?? null } as unknown as BookingDetails);
  };

  const checkReview = async () => {
    if (!bookingId) return;
    const { count } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    setHasReview((count ?? 0) > 0);
  };

  useEffect(() => {
    fetchBooking();
    checkReview();
  }, [bookingId]);

  // Realtime — booking status changes appear live
  useEffect(() => {
    if (!bookingId) return;
    const channel = supabase
      .channel(`booking-conf-${bookingId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        (payload) => {
          const updated = payload.new as BookingDetails;
          setBooking((prev) => prev ? { ...prev, ...updated } : updated);
          if (updated.status === "confirmed") {
            toast({ title: "✅ Provider Confirmed!", description: "Your booking is now confirmed." });
          } else if (updated.status === "in_progress") {
            toast({ title: "🚀 Service Started!", description: "Your provider has begun work." });
          } else if (updated.status === "completed") {
            toast({ title: "✅ Service Complete!", description: "Please rate your experience." });
            checkReview();
          }
          if (updated.provider_departed_at) {
            toast({
              title: "🚗 Provider On The Way!",
              description: updated.provider_eta_minutes
                ? `ETA ~${updated.provider_eta_minutes} minutes`
                : "They're heading to you now.",
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bookingId]);

  useEffect(() => {
    if (booking && !toastShown) {
      const status = booking.status ?? 'pending';
      if (status === 'pending') {
        toast({
          title: "⏳ Request Sent!",
          description: "Waiting for the provider to accept your booking.",
        });
      } else {
        toast({
          title: "🎉 Booking Placed!",
          description: `${booking.service_providers?.full_name ?? booking.service_providers?.name ?? 'Provider'} will confirm soon.`,
        });
      }
      setToastShown(true);
    }
  }, [booking, toastShown, toast]);

  // Nobody accepted in time: the server cancels stale requests (pg_cron); this makes the screen
  // resolve itself even if cron is not enabled. 30 minutes must match expire_stale_pending_bookings.
  const pendingSince = booking?.status === "pending" ? booking.created_at : null;
  useEffect(() => {
    if (!bookingId || !pendingSince) return;
    const wait = Math.max(0, new Date(pendingSince).getTime() + 30 * 60_000 - Date.now()) + 1_000;
    const t = setTimeout(async () => {
      await (supabase as any).rpc("expire_my_pending_booking", { p_booking_id: bookingId, p_minutes: 30 });
      fetchBooking();
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, pendingSince]);

  const formattedBookingId = useMemo(() => {
    if (!booking?.id) return "-";
    return `HF-${booking.id.slice(0, 8).toUpperCase()}`;
  }, [booking?.id]);

  const status = booking?.status ?? "pending";
  const sp = booking?.service_providers as unknown as { full_name?: string | null; name?: string | null } | null;
  const providerName = sp?.full_name ?? sp?.name ?? null;
  const display = statusDisplay[status as keyof typeof statusDisplay] ?? statusDisplay.pending;

  // Live timeline steps
  const steps = [
    { label: "Request Sent",          done: true },
    { label: "Provider Confirmed",   done: ["confirmed", "in_progress", "completed"].includes(status) },
    { label: "Provider On The Way",  done: !!booking?.provider_departed_at, eta: booking?.provider_eta_minutes },
    { label: "Service In Progress",  done: ["in_progress", "completed"].includes(status) },
    { label: "Completed ✅",           done: status === "completed" },
  ];

  const submitReview = async () => {
    if (!user || !booking) return;
    setSubmittingReview(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = await supabase.from("reviews").insert({
      booking_id:    booking.id,
      customer_id:   user.id,          // NOT NULL — required by schema
      user_id:       user.id,          // nullable — satisfies RLS policy if it checks user_id
      provider_id:   booking.provider_id,
      rating:        reviewRating,
      comment:       reviewComment || null,
      reviewer_name: profile?.full_name || user.email,
    });

    setSubmittingReview(false);
    if (!error) {
      toast({ title: "Review submitted! ⭐", description: "Thank you for your feedback." });
      setShowReview(false);
      setHasReview(true);
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 px-4 md:pt-28"
      >
        <div className="max-w-2xl mx-auto space-y-6">
          <StatusHero
            status={status}
            onTheWay={Boolean(booking?.provider_departed_at)}
            arrived={status === "on_the_way" && booking?.provider_eta_minutes === 0}
            etaMinutes={booking?.provider_eta_minutes}
            providerName={providerName}
            bookingCode={formattedBookingId}
          />

          {bookingId && status === "on_the_way" && booking?.latitude != null && booking?.longitude != null && (
            <TrackingMap
              bookingId={bookingId}
              destination={{ latitude: booking.latitude, longitude: booking.longitude }}
              etaMinutes={booking.provider_eta_minutes}
              arrived={booking.provider_eta_minutes === 0}
            />
          )}

          {/* Progress */}
          <div className="rounded-3xl border border-border p-5">
            <h2 className="mb-4 text-base font-extrabold tracking-tight">Progress</h2>
            <ol className="space-y-4">
              {steps.map((st, i) => (
                <motion.li key={st.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }} className="flex items-center gap-3">
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition-colors duration-500", st.done ? "bg-gold text-gold-foreground" : "bg-secondary text-muted-foreground")}>
                    {st.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className={cn("text-sm", st.done ? "font-bold" : "text-muted-foreground")}>{st.label.replace(" ✅", "")}</span>
                  {st.done && st.label === "Provider On The Way" && st.eta ? <span className="ml-auto rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">~{st.eta} min</span> : null}
                </motion.li>
              ))}
            </ol>
          </div>

          {/* Provider */}
          {booking?.service_providers && (
            <div className="flex items-center gap-4 rounded-3xl border border-border p-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-primary text-lg font-bold text-primary-foreground">
                  {(booking.service_providers?.full_name ?? booking.service_providers?.name ?? "P")[0]}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{booking.service_providers?.full_name ?? booking.service_providers?.name}</p>
                {booking.service_providers.rating ? (
                  <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold"><Star className="h-3.5 w-3.5 fill-gold text-gold" />{booking.service_providers.rating}</p>
                ) : null}
              </div>
              {booking.service_providers.phone && (
                <a href={`tel:${booking.service_providers.phone}`} className="press flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Call provider">
                  <Phone className="h-5 w-5" />
                </a>
              )}
            </div>
          )}

          {/* Details */}
          <div className="rounded-3xl bg-secondary p-5">
            <h2 className="mb-3 text-base font-extrabold tracking-tight">Details</h2>
            <dl className="divide-y divide-border/70 text-sm">
              {[
                ["Service", booking?.services?.name ?? "—"],
                ["When", `${booking?.booking_date ? format(new Date(booking.booking_date), "EEE, d MMM") : "—"}${booking?.booking_time ? ` · ${booking.booking_time.slice(0, 5)}` : ""}`],
                ["Where", [booking?.address, booking?.city, booking?.pincode].filter(Boolean).join(", ") || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6 py-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
              ))}
              {booking?.total_amount ? (
                <div className="flex justify-between py-3 text-base font-extrabold"><dt>Total</dt><dd>₹{booking.total_amount}</dd></div>
              ) : null}
            </dl>
            {bookingId && (
              <div className="mt-2 border-t border-border/70 pt-4">
                <AttachmentViewer bookingId={bookingId} note={booking?.special_instructions ?? booking?.description} lazy visible />
              </div>
            )}
          </div>

          {/* Completion Code — shown for active bookings only */}
          {bookingId && ['confirmed', 'on_the_way', 'in_progress'].includes(status) && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.52 }}>
              <CompletionCodeCard bookingId={bookingId} />
            </motion.div>
          )}

          {/* Cancelled — retry card */}
          {status === 'cancelled' && (
            <div className="rounded-3xl border border-destructive/30 p-5 text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                {booking?.cancellation_reason || 'The provider was unable to take this booking.'} You can book with another provider.
              </p>
              <Button className="h-14 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground" onClick={() => navigate(`/services/${booking?.services?.slug ?? ''}?pincode=${booking?.pincode ?? ''}`)}>
                Find another provider
              </Button>
            </div>
          )}

          {/* Rate & review */}
          {status === "completed" && !hasReview && (
            <div className="rounded-3xl bg-gold p-6 text-gold-foreground">
              <h3 className="text-xl font-extrabold tracking-tight">How was it?</h3>
              <p className="mb-4 mt-1 text-sm opacity-80">Your review helps others choose great pros.</p>
              <Button className="h-14 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground" onClick={() => setShowReview(true)}>
                <Star className="mr-2 h-4 w-4" /> Rate &amp; review
              </Button>
            </div>
          )}

          {/* Pay after service: Razorpay. The amount shown is read from the booking; the server re-reads it. */}
          {status === "completed" && booking?.total_amount ? (
            <PayCard
              bookingId={booking.id}
              amount={Number(booking.total_amount)}
              paymentStatus={booking.payment_status ?? null}
              onChanged={fetchBooking}
            />
          ) : null}

          <div className="flex gap-3">
            <Button onClick={() => navigate("/my-bookings")} className="h-14 flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground">
              My bookings <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => navigate("/")} className="h-14 rounded-2xl px-5" aria-label="Home">
              <Home className="h-5 w-5" />
            </Button>
          </div>

          {/* Sticky chat button */}
          {["confirmed", "on_the_way", "in_progress"].includes(status) && user && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-2xl">
              <button onClick={() => setShowChat(true)} className="press mx-auto flex h-14 w-full max-w-2xl items-center justify-center gap-2 rounded-2xl bg-gold text-base font-bold text-gold-foreground">
                <MessageCircle className="h-5 w-5" /> Message {booking?.service_providers?.full_name ?? booking?.service_providers?.name}
              </button>
            </div>
          )}
        </div>
      </motion.main>

      {/* Chat Dialog */}
      {showChat && bookingId && user && (
        <Dialog open={showChat} onOpenChange={setShowChat}>
          <DialogContent className="bg-card border-border p-0 max-w-md">
            <DialogHeader className="p-4 pb-0 border-b border-border">
              <DialogTitle className="text-foreground flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Chat with {booking?.service_providers?.full_name ?? booking?.service_providers?.name}
              </DialogTitle>
            </DialogHeader>
            <BookingChat
              bookingId={bookingId}
              currentUserId={user.id}
              senderType="customer"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Review Dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rate Your Experience</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-3">
                {booking?.services?.name} with {booking?.service_providers?.full_name ?? booking?.service_providers?.name}
              </p>
              <StarPicker value={reviewRating} onChange={setReviewRating} />
              <p className="text-muted-foreground text-xs mt-2">
                {["", "Poor", "Fair", "Good", "Great", "Excellent!"][reviewRating]}
              </p>
            </div>
            <Textarea
              placeholder="Tell others about your experience... (optional)"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              className="bg-secondary border-border rounded-xl"
              rows={3}
            />
            <Button
              onClick={submitReview}
              disabled={submittingReview || reviewRating === 0}
              className="w-full bg-gradient-gold text-primary-foreground font-bold rounded-xl hover:opacity-90"
            >
              {submittingReview ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default BookingConfirmation;
