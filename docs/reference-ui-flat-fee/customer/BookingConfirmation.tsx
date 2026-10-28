import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Calendar, MapPin, Hash, Phone, ArrowRight, Home, MessageCircle, Star, Copy, Info, Loader2, XCircle, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingChat from "@/components/BookingChat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import AttachmentViewer from "@/components/AttachmentViewer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import BillCard from "@/components/booking/BillCard";
import ReportProblem from "@/components/booking/ReportProblem";
import NextBestPros from "@/components/booking/NextBestPros";
import { useBookingProvider } from "@/lib/pricing";

type BookingDetails = {
  id: string;
  status: string | null;
  booking_date: string;
  booking_time: string;
  scheduled_date?: string;
  scheduled_time?: string;
  address: string;
  city: string | null;
  pincode: string;
  total_amount: number | null;
  provider_id: string | null;
  provider_departed_at: string | null;
  provider_eta_minutes: number | null;
  cancellation_reason?: string | null;
  special_instructions?: string | null;
  description?: string | null;
  base_amount?: number | null;
  extras_amount?: number | null;
  arrived_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  replaced_by?: string | null;
  sub_item_name?: string | null;
  services: { name: string; slug: string | null } | null;
};

const ACCEPT_WINDOW_MS = 30_000;

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
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/25 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-foreground text-sm">🔐 Your Completion Code</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors" aria-label="What is this?">
                <Info className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              Share this code with your provider <strong>only after the work is finished</strong> to your satisfaction. This confirms completion.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex gap-2.5">
          {code.split('').map((digit, i) => (
            <div key={i} className="w-12 h-14 rounded-xl bg-card border-2 border-primary/30 flex items-center justify-center text-2xl font-bold text-primary shadow-sm">
              {digit}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="p-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
          aria-label="Copy completion code"
        >
          {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Share this code with the provider <strong className="text-foreground">only after the work is finished</strong> to your satisfaction.
      </p>
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
          className="transition-transform hover:scale-110"
        >
          <Star
            className={`w-8 h-8 transition-colors ${
              star <= (hovered || value) ? "text-yellow-400 fill-current" : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

const statusDisplay: Record<string, { icon: string; iconBg: string; title: string; subtitle: string; titleColor: string }> = {
  pending: {
    icon: '⏳',
    iconBg: 'bg-amber-400/10 border-amber-400/30',
    title: 'Finding your pro',
    subtitle: 'Your request is with the pro. They have 30 seconds to accept.',
    titleColor: 'text-foreground',
  },
  confirmed: {
    icon: '✅',
    iconBg: 'bg-green-500/10 border-green-500/30',
    title: 'Booking confirmed',
    subtitle: 'Your pro accepted. Chat and call are now open.',
    titleColor: 'text-green-600 dark:text-green-400',
  },
  on_the_way: {
    icon: '🚗',
    iconBg: 'bg-blue-500/10 border-blue-500/30',
    title: 'Pro on the way',
    subtitle: 'Track them live. Your code stays with you until the work is done.',
    titleColor: 'text-blue-600 dark:text-blue-400',
  },
  arrived: {
    icon: '📍',
    iconBg: 'bg-blue-500/10 border-blue-500/30',
    title: 'Your pro has arrived',
    subtitle: 'They will start the job shortly.',
    titleColor: 'text-blue-600 dark:text-blue-400',
  },
  in_progress: {
    icon: '🛠️',
    iconBg: 'bg-zinc-900/10 border-zinc-900/20 dark:bg-white/10 dark:border-white/20',
    title: 'Work in progress',
    subtitle: 'Approve any extra work here. Share your code only when you are happy.',
    titleColor: 'text-foreground',
  },
  completed: {
    icon: '🎉',
    iconBg: 'bg-green-500/10 border-green-500/30',
    title: 'All done',
    subtitle: 'Hope the job went well. Pay your pro directly and rate them.',
    titleColor: 'text-green-600 dark:text-green-400',
  },
  cancelled: {
    icon: '✕',
    iconBg: 'bg-destructive/10 border-destructive/30',
    title: 'Booking not confirmed',
    subtitle: 'No charge. You can pick another pro below.',
    titleColor: 'text-destructive',
  },
};

const BookingConfirmation = () => {
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  // Auto-open chat when coming from ?chat=1 notification deep-link
  const autoOpenChat = searchParams.get('chat') === '1';
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showChat, setShowChat] = useState(autoOpenChat);
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [hasReview, setHasReview] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const status = booking?.status ?? "pending";
  const provider = useBookingProvider(bookingId, status);
  const providerName = provider?.full_name ?? "your pro";

  const fetchBooking = async () => {
    if (!bookingId) return;
    const { data } = await (supabase as any)
      .from("bookings")
      .select("*, services(name, slug)")
      .eq("id", bookingId)
      .maybeSingle();
    setBooking(data as BookingDetails | null);
    setLoaded(true);
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
    setLoaded(false);
    void fetchBooking();
    void checkReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // The 30-second accept window drives the "next best pros" offer.
  useEffect(() => {
    if (status !== "pending") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [status]);

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
          setBooking((prev) => {
            if (prev?.status !== updated.status) {
              if (updated.status === "confirmed") toast({ title: "Pro accepted", description: "Your booking is confirmed." });
              else if (updated.status === "on_the_way") toast({ title: "Pro on the way", description: updated.provider_eta_minutes ? `ETA ~${updated.provider_eta_minutes} min` : "Track them live." });
              else if (updated.status === "in_progress") toast({ title: "Work started" });
              else if (updated.status === "completed") { toast({ title: "Job complete", description: "Please rate your pro." }); void checkReview(); }
            } else if (!prev?.arrived_at && updated.arrived_at) {
              toast({ title: "Your pro has arrived" });
            }
            return prev ? { ...prev, ...updated } : updated;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const formattedBookingId = useMemo(() => {
    if (!booking?.id) return "-";
    return `HF-${booking.id.slice(0, 8).toUpperCase()}`;
  }, [booking?.id]);

  const arrived = status === "on_the_way" && !!booking?.arrived_at;
  const display = statusDisplay[arrived ? "arrived" : status] ?? statusDisplay.pending;
  const waitedTooLong = status === "pending" && !!booking?.created_at
    && now - new Date(booking.created_at).getTime() > ACCEPT_WINDOW_MS;
  const declinedByPro = status === "cancelled" && !booking?.replaced_by
    && !/customer/i.test(booking?.cancellation_reason ?? "");
  const canCancel = ["pending", "confirmed"].includes(status);
  const total = Number(booking?.total_amount ?? 0);
  const serviceHref = `/services/${booking?.services?.slug ?? ""}?city=${encodeURIComponent(booking?.city ?? "")}`;

  const steps = [
    { label: "Request sent", done: true },
    { label: "Pro accepted", done: ["confirmed", "on_the_way", "in_progress", "completed"].includes(status) },
    { label: "On the way", done: ["on_the_way", "in_progress", "completed"].includes(status), eta: status === "on_the_way" && !arrived ? booking?.provider_eta_minutes : null },
    { label: "Arrived", done: arrived || ["in_progress", "completed"].includes(status) },
    { label: "Work in progress", done: ["in_progress", "completed"].includes(status) },
    { label: "Completed", done: status === "completed" },
  ];

  const cancelBooking = async () => {
    if (!booking) return;
    setCancelling(true);
    const { error } = await (supabase as any).from("bookings").update({
      status: "cancelled",
      cancellation_reason: "Cancelled by customer",
      cancelled_at: new Date().toISOString(),
    }).eq("id", booking.id).in("status", ["pending", "confirmed"]);
    setCancelling(false);
    setConfirmCancel(false);
    if (error) {
      toast({ title: "Could not cancel", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Booking cancelled", description: "No charge." });
    void fetchBooking();
  };

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
      toast({ title: "Review submitted", description: "Thank you for your feedback." });
      setShowReview(false);
      setHasReview(true);
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loaded && !booking) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto max-w-md px-4 pt-32 pb-16 text-center">
          <h1 className="text-2xl font-bold">Booking not found</h1>
          <p className="mt-2 text-muted-foreground">It may have been removed, or it belongs to another account.</p>
          <Button className="mt-6 bg-gradient-gold font-bold text-primary-foreground" onClick={() => navigate("/my-bookings")}>My bookings</Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="container mx-auto pt-28 pb-16 px-4"
      >
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Status hero */}
          <div className={cn(
            "relative overflow-hidden rounded-3xl p-7 text-center",
            status === "in_progress" ? "bg-zinc-900 text-white" : status === "completed" ? "bg-green-600 text-white" : "border border-border bg-card",
          )}>
            {!loaded ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <motion.div
                  key={display.title}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 16 }}
                  className={cn("mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 text-4xl", display.iconBg)}
                >
                  {display.icon}
                </motion.div>
                <h1 className={cn("mb-1 text-2xl font-bold tracking-tight md:text-3xl", ["in_progress", "completed"].includes(status) ? "text-white" : display.titleColor)}>
                  {display.title}
                </h1>
                <p className={cn("text-sm", ["in_progress", "completed"].includes(status) ? "text-white/75" : "text-muted-foreground")}>
                  {status === "in_progress" ? `${provider?.full_name ?? "Your pro"} has started the job.` : display.subtitle}
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 dark:bg-white/10">
                  <Hash className="h-3 w-3 opacity-60" />
                  <span className="font-mono text-xs opacity-75">{formattedBookingId}</span>
                </div>
              </>
            )}
          </div>

          {/* No answer within 30 s, or the pro declined: offer the next best pros at once */}
          {bookingId && (waitedTooLong || declinedByPro) && (
            <NextBestPros bookingId={bookingId} reason={declinedByPro ? "declined" : "no_answer"} fallbackHref={serviceHref} />
          )}

          {status === "cancelled" && booking?.replaced_by && (
            <Button variant="outline" className="w-full rounded-2xl" onClick={() => navigate(`/booking-confirmation/${booking.replaced_by}`)}>
              Go to your new booking <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          {status === "cancelled" && !declinedByPro && !booking?.replaced_by && (
            <Button className="w-full rounded-2xl bg-gradient-gold font-bold text-primary-foreground" onClick={() => navigate(serviceHref)}>
              <RotateCcw className="mr-2 h-4 w-4" /> Book again
            </Button>
          )}

          {/* Completion code: the customer closes the job */}
          {bookingId && ['confirmed', 'on_the_way', 'in_progress'].includes(status) && (
            <CompletionCodeCard bookingId={bookingId} />
          )}

          {/* Bill + extra-work approvals */}
          {bookingId && booking && status !== "cancelled" && (
            <BillCard
              bookingId={bookingId}
              status={status}
              total={total}
              lockedPrice={booking.base_amount ?? null}
              providerName={provider?.full_name ?? "the pro"}
            />
          )}

          {/* Rate (once) + report a problem */}
          {status === "completed" && !hasReview && (
            <div className="rounded-2xl border border-border bg-card p-5 text-center">
              <h3 className="font-bold">How was {provider?.full_name ?? "your pro"}?</h3>
              <div className="my-3"><StarPicker value={reviewRating} onChange={setReviewRating} /></div>
              <Button className="w-full rounded-xl bg-gradient-gold font-bold text-primary-foreground" onClick={() => setShowReview(true)}>
                Submit review
              </Button>
            </div>
          )}
          {status === "completed" && bookingId && (
            <ReportProblem bookingId={bookingId} completedAt={booking?.completed_at ?? null} />
          )}
          {status === "completed" && (
            <Button variant="outline" className="w-full rounded-2xl" onClick={() => navigate(serviceHref)}>
              <RotateCcw className="mr-2 h-4 w-4" /> Book again
            </Button>
          )}

          {/* Pro card */}
          {provider && (
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-gradient-gold text-lg font-bold text-primary-foreground">
                  {(provider.full_name ?? "P")[0]}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-bold">
                  {provider.full_name}
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" aria-label="KYC verified" />
                </p>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {Number(provider.rating ?? 0).toFixed(1)} · {provider.total_jobs ?? 0} jobs
                </p>
              </div>
              {provider.phone ? (
                <a href={`tel:${provider.phone}`}
                  className="flex items-center gap-1.5 rounded-xl border border-primary/30 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10">
                  <Phone className="h-4 w-4" /> Call
                </a>
              ) : status === "pending" ? (
                <span className="text-right text-[11px] text-muted-foreground">Number shown<br />after confirmation</span>
              ) : null}
            </div>
          )}

          {/* Chat */}
          {["confirmed", "on_the_way", "in_progress"].includes(status) && user && (
            <Button
              className="h-12 w-full rounded-2xl bg-zinc-900 font-bold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
              onClick={() => setShowChat(true)}
            >
              <MessageCircle className="mr-2 h-5 w-5" /> Message {provider?.full_name ?? "your pro"}
            </Button>
          )}

          {/* Live timeline */}
          {status !== "cancelled" && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold">Timeline</h2>
              <ol className="relative space-y-4 pl-6">
                <div className="absolute bottom-1 left-[7px] top-1 w-0.5 bg-border" />
                {steps.map((step) => (
                  <li key={step.label} className="relative flex items-center gap-3">
                    <span className={cn(
                      "absolute -left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-background transition-all duration-500",
                      step.done ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-border",
                    )} />
                    <span className={cn("text-sm", step.done ? "font-semibold text-foreground" : "text-muted-foreground")}>{step.label}</span>
                    {step.eta ? (
                      <Badge className="border border-blue-500/20 bg-blue-500/15 text-xs text-blue-600 dark:text-blue-400">~{step.eta} min</Badge>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Booking details */}
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">Booking details</h2>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-xl bg-secondary p-3">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">{booking?.sub_item_name ?? booking?.services?.name ?? "Service"}</p>
                  <p className="font-medium">
                    {booking?.booking_date ? format(new Date(booking.booking_date), "EEE, d MMM yyyy") : "—"}
                    {booking?.booking_time ? ` · ${booking.booking_time.slice(0, 5)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-secondary p-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-medium">{booking?.address}{booking?.city ? `, ${booking.city}` : ""} — {booking?.pincode}</p>
                </div>
              </div>
            </div>
            {bookingId && (
              <div className="border-t border-border pt-4">
                <AttachmentViewer bookingId={bookingId} note={booking?.special_instructions ?? booking?.description} lazy visible />
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {canCancel && (
              <Button variant="outline" className="flex-1 rounded-xl border-red-300 py-6 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                onClick={() => setConfirmCancel(true)}>
                <XCircle className="mr-2 h-4 w-4" /> Cancel booking
              </Button>
            )}
            <Button onClick={() => navigate("/my-bookings")} className="flex-1 rounded-xl bg-gradient-gold py-6 font-bold text-primary-foreground">
              My bookings <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => navigate("/")} className="flex-1 rounded-xl py-6">
              <Home className="mr-2 h-4 w-4" /> Home
            </Button>
          </div>
        </div>
      </motion.main>

      {/* Cancel confirmation */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancelling is free while the booking is pending or confirmed. Frequent late cancellations can pause instant booking for a week.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void cancelBooking(); }} disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chat Dialog */}
      {showChat && bookingId && user && (
        <Dialog open={showChat} onOpenChange={setShowChat}>
          <DialogContent className="bg-card border-border p-0 max-w-md">
            <DialogHeader className="p-4 pb-0 border-b border-border">
              <DialogTitle className="text-foreground flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Chat with {providerName}
              </DialogTitle>
            </DialogHeader>
            <BookingChat bookingId={bookingId} currentUserId={user.id} senderType="customer" />
          </DialogContent>
        </Dialog>
      )}

      {/* Review Dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rate your experience</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-3">
                {booking?.services?.name} with {providerName}
              </p>
              <StarPicker value={reviewRating} onChange={setReviewRating} />
              <p className="text-muted-foreground text-xs mt-2">
                {["", "Poor", "Fair", "Good", "Great", "Excellent!"][reviewRating]}
              </p>
            </div>
            <Textarea
              placeholder="Tell others about your experience (optional)"
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
              {submittingReview ? "Submitting..." : "Submit review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default BookingConfirmation;
