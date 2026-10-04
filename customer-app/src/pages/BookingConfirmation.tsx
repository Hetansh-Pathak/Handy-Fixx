import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Calendar, MapPin, User, Hash, Phone, ArrowRight, Home, MessageCircle, Star, Car } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import AttachmentViewer from "@/components/AttachmentViewer";

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
  services: { name: string; slug: string | null } | null;
  service_providers: { full_name: string | null; name: string | null; rating: number | null; phone: string | null } | null;
};

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
      .select("id, status, booking_date, booking_time, scheduled_date, scheduled_time, address, city, pincode, total_amount, provider_id, provider_departed_at, provider_eta_minutes, cancellation_reason, special_instructions, description, services(name, slug), service_providers(full_name, name, rating, phone)")
      .eq("id", bookingId)
      .single();
    setBooking(data as unknown as BookingDetails | null);
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

  const formattedBookingId = useMemo(() => {
    if (!booking?.id) return "-";
    return `HF-${booking.id.slice(0, 8).toUpperCase()}`;
  }, [booking?.id]);

  const status = booking?.status ?? "pending";
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
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto pt-28 pb-16 px-4"
      >
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Top card — dynamic status */}
          <div className="bg-card border border-border rounded-2xl p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
            </div>
            <motion.div
              key={status}  /* re-animate when status changes */
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
              className={`mx-auto w-24 h-24 rounded-full border-2 flex items-center justify-center mb-6 ${display.iconBg}`}
            >
              <span className="text-5xl">{display.icon}</span>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <h1 className={`text-3xl font-bold mb-2 ${display.titleColor}`}>{display.title}</h1>
              <p className="text-muted-foreground text-sm mb-3">{display.subtitle}</p>
              {status !== 'pending' && (
                <div className="inline-flex items-center gap-2 bg-secondary rounded-full px-4 py-1.5">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-mono text-muted-foreground">{formattedBookingId}</span>
                </div>
              )}
              {status === 'pending' && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-2">
                  <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                  Waiting for provider response...
                </div>
              )}
            </motion.div>
          </div>

          {/* Live Status Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <h2 className="font-semibold text-foreground mb-5">Live Status</h2>
            <div className="relative pl-6 space-y-5">
              <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
              {steps.map((step) => (
                <motion.div
                  key={step.label}
                  className="relative flex items-center gap-3"
                  animate={{ opacity: 1 }}
                >
                  <div className={cn(
                    "absolute -left-4 w-3.5 h-3.5 rounded-full border-2 border-background transition-all duration-500",
                    step.done ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-border"
                  )} />
                  <span className={cn(
                    "text-sm transition-colors",
                    step.done ? "text-foreground font-semibold" : "text-muted-foreground"
                  )}>
                    {step.label}
                  </span>
                  {step.done && step.label === "Provider On The Way" && step.eta && (
                    <Badge className="bg-blue-500/20 text-blue-400 text-xs border border-blue-500/20">
                      ~{step.eta} mins
                    </Badge>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Provider info card */}
          {booking?.service_providers && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4"
            >
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-gradient-gold text-primary-foreground text-lg font-bold">
                {(booking.service_providers?.full_name ?? booking.service_providers?.name ?? "P")[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-bold text-foreground">{booking.service_providers?.full_name ?? booking.service_providers?.name}</p>
                {booking.service_providers.rating && (
                  <p className="text-sm text-yellow-400 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    {booking.service_providers.rating} rating
                  </p>
                )}
              </div>
              {booking.service_providers.phone && (
                <a
                  href={`tel:${booking.service_providers.phone}`}
                  className="flex items-center gap-1.5 text-primary font-semibold text-sm border border-primary/30 px-3 py-2 rounded-xl hover:bg-primary/10 transition-colors"
                >
                  <Phone className="w-4 h-4" /> Call
                </a>
              )}
            </motion.div>
          )}

          {/* Booking details */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="bg-card border border-border rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-semibold text-foreground text-lg">Booking Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3 bg-secondary rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Service</p>
                  <p className="font-medium text-foreground">{booking?.services?.name ?? "—"}</p>
                  <p className="text-muted-foreground">{booking?.service_providers?.full_name ?? booking?.service_providers?.name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-secondary rounded-xl p-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Date & Time</p>
                  <p className="font-medium text-foreground">
                    {booking?.booking_date ? format(new Date(booking.booking_date), "EEEE, d MMMM yyyy") : "—"}
                  </p>
                  <p className="text-muted-foreground">{booking?.booking_time?.slice(0, 5)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-secondary rounded-xl p-4 sm:col-span-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Address</p>
                  <p className="font-medium text-foreground">
                    {booking?.address}, {booking?.city} — {booking?.pincode}
                  </p>
                </div>
              </div>
            </div>

            {booking?.total_amount && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <span className="text-muted-foreground text-sm">Total Amount</span>
                <span className="text-primary font-bold text-lg">₹{booking.total_amount}</span>
              </div>
            )}

            {/* Problem description attachments */}
            {bookingId && (
              <div className="pt-4 border-t border-border">
                <AttachmentViewer
                  bookingId={bookingId}
                  note={booking?.special_instructions ?? booking?.description}
                  lazy
                  visible
                />
              </div>
            )}
          </motion.div>

          {/* Cancelled — retry card */}
          {status === 'cancelled' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <div className="bg-card border border-destructive/20 rounded-2xl p-5 text-center">
                <p className="text-muted-foreground text-sm mb-4">
                  {booking?.cancellation_reason || 'The provider was unable to take this booking.'}{' '}
                  You can book with another provider.
                </p>
                <Button
                  className="bg-gradient-gold text-primary-foreground font-bold rounded-xl w-full"
                  onClick={() => navigate(`/services/${booking?.services?.slug ?? ''}?pincode=${booking?.pincode ?? ''}`)}
                >
                  Find Another Provider →
                </Button>
              </div>
            </motion.div>
          )}

          {/* Chat button (when confirmed / in_progress) */}
          {["confirmed", "in_progress"].includes(status) && user && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <Button
                className="w-full bg-gradient-gold text-primary-foreground font-bold h-12 rounded-2xl shadow-gold hover:opacity-90"
                onClick={() => setShowChat(true)}
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                Message {booking?.service_providers?.full_name ?? booking?.service_providers?.name}
              </Button>

            </motion.div>
          )}

          {/* Rate & Review — shown when completed and no review yet */}
          {status === "completed" && !hasReview && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <div className="bg-card border border-primary/20 rounded-2xl p-5">
                <h3 className="font-bold text-foreground mb-1">How was your experience?</h3>
                <p className="text-muted-foreground text-sm mb-4">Your review helps others find great providers.</p>
                <Button
                  className="w-full bg-gradient-gold text-primary-foreground font-bold rounded-xl h-11 hover:opacity-90"
                  onClick={() => setShowReview(true)}
                >
                  <Star className="w-4 h-4 mr-2" /> Rate & Review
                </Button>
              </div>
            </motion.div>
          )}

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <Button
              onClick={() => navigate("/my-bookings")}
              className="flex-1 bg-gradient-gold text-primary-foreground font-bold py-6 rounded-xl shadow-gold hover:opacity-90 transition-opacity"
            >
              View My Bookings <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="flex-1 border-border py-6 rounded-xl"
            >
              <Home className="w-4 h-4 mr-2" /> Go to Home
            </Button>
          </motion.div>
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

      <Footer />
    </div>
  );
};

export default BookingConfirmation;
