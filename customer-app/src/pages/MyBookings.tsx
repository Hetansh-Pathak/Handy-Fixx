import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingChat from "@/components/BookingChat";
import LiveMap from "@/components/LiveMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Star, Calendar, XCircle, Package, Loader2, MessageCircle, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import AttachmentViewer, { useBookingAttachments, AttachmentBadges } from "@/components/AttachmentViewer";

const sb = supabase as any;

// ── Notification → booking status mapping ──────────────────────────────────
const NOTIF_STATUS: Record<string, string> = {
  booking_confirmed:   "confirmed",
  job_started:         "in_progress",
  provider_on_the_way: "on_the_way",
  job_completed:       "completed",
  booking_cancelled:   "cancelled",
};

const STATUS_LABEL: Record<string, { label: string; cls: string; icon: string }> = {
  pending:     { label: "Pending",     cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",  icon: "⏳" },
  confirmed:   { label: "Confirmed",   cls: "bg-primary/20 text-primary border-primary/30",           icon: "✅" },
  on_the_way:  { label: "On the way",  cls: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: "🚗" },
  in_progress: { label: "In Progress", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30",        icon: "🚀" },
  completed:   { label: "Completed",   cls: "bg-green-500/20 text-green-400 border-green-500/30",     icon: "🎉" },
  cancelled:   { label: "Cancelled",   cls: "bg-red-500/20 text-red-400 border-red-500/30",           icon: "❌" },
};

type BookingCard = {
  booking_id: string;
  status: string;
  service_name: string;
  provider_name: string;
  provider_id: string | null;
  created_at: string;
  has_chat: boolean;
  has_review_prompt: boolean;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
};

const BookingTracker = ({ bookingId, status, latitude, longitude }: {
  bookingId: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
}) => {
  const [providerLocation, setProviderLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!latitude || !longitude || !["on_the_way", "in_progress"].includes(status)) return;

    const loadLocation = async () => {
      const { data } = await sb
        .from("provider_locations")
        .select("latitude, longitude")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (data) setProviderLocation(data);
    };
    loadLocation();

    const channel = sb
      .channel(`provider-location-${bookingId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "provider_locations",
        filter: `booking_id=eq.${bookingId}`,
      }, (payload: any) => {
        if (payload.new?.latitude && payload.new?.longitude) setProviderLocation(payload.new);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [bookingId, status, latitude, longitude]);

  if (!latitude || !longitude) return null;
  const markers = [
    { latitude, longitude, label: "Your service location", color: "gold" as const },
    ...(providerLocation ? [{ ...providerLocation, label: "Provider", color: "blue" as const }] : []),
  ];

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-4">
      {status === "on_the_way" && (
        <div className="rounded-xl bg-orange-500/10 px-3 py-2 text-sm font-semibold text-orange-400">
          Provider is on the way
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">Track Provider</p>
      <LiveMap markers={markers} height="220px" />
      <p className="text-xs text-muted-foreground">
        {providerLocation ? "Live provider location" : "Waiting for the provider to share their location..."}
      </p>
    </div>
  );
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

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const tabs = ["all", "upcoming", "completed", "cancelled"] as const;

/** Lightweight badge that shows 🎤/📷 if the booking has attachments */
function AttachmentBadgeForCard({ bookingId }: { bookingId: string }) {
  const { hasAudio, hasImages, attachments } = useBookingAttachments(bookingId);
  const imageCount = attachments.filter(a => a.type === "image").length;
  if (!hasAudio && !hasImages) return null;
  return <AttachmentBadges hasAudio={hasAudio} hasImages={hasImages} imageCount={imageCount} />;
}

const MyBookings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [cards, setCards] = useState<BookingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [reviewInfo, setReviewInfo] = useState<{ service: string; provider: string; provider_id: string | null } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const buildCards = (notifs: any[]): BookingCard[] => {
    // Group notifications by booking_id
    const byBooking: Record<string, any[]> = {};
    for (const n of notifs) {
      if (!n.booking_id) continue;
      if (!byBooking[n.booking_id]) byBooking[n.booking_id] = [];
      byBooking[n.booking_id].push(n);
    }

    return Object.entries(byBooking).map(([booking_id, notifList]) => {
      // Sort: newest last to get latest status
      notifList.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const latest = notifList[notifList.length - 1];
      const first = notifList[0];

      // Derive status from latest notification type
      let status = "pending";
      for (const n of notifList) {
        const s = NOTIF_STATUS[n.type];
        if (s) status = s;
      }

      // Extract provider & service from data JSON or message text
      const data = (latest.data || first.data || {}) as Record<string, any>;
      let provider_name = data.provider_name || data.providerName || "Your Provider";
      let service_name  = data.service_name  || data.serviceName  || "Home Service";
      let provider_id   = data.provider_id   || data.providerId   || null;

      // Fallback: parse from message string if data is empty
      if (!data.provider_name) {
        const msg = first.message || "";
        const m = msg.match(/^(.+?) (accepted|started|completed|is on)/);
        if (m) provider_name = m[1];
      }

      const has_chat = ["confirmed", "on_the_way", "in_progress"].includes(status);
      const has_review_prompt = status === "completed";

      return {
        booking_id,
        status,
        service_name,
        provider_name,
        provider_id,
        created_at: first.created_at,
        has_chat,
        has_review_prompt,
        latitude: null,
        longitude: null,
        address: null,
        city: null,
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    // ── Strategy 1: Try direct booking query (works after SQL is run) ──────
    const { data: direct } = await sb
      .from("bookings")
      .select("id, status, booking_date, booking_time, scheduled_date, address, city, latitude, longitude, total_amount, created_at, provider_id, services(name), service_providers(full_name, name)")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (direct && direct.length > 0) {
      // Convert real bookings to card format
      const realCards: BookingCard[] = direct.map((b: any) => ({
        booking_id:        b.id,
        status:            b.status ?? "pending",
        service_name:      b.services?.name ?? "Home Service",
        provider_name:     b.service_providers?.full_name ?? b.service_providers?.name ?? "Provider",
        provider_id:       b.provider_id,
        created_at:        b.created_at,
        has_chat:          ["confirmed", "on_the_way", "in_progress"].includes(b.status ?? ""),
        has_review_prompt: b.status === "completed",
        latitude:          b.latitude ?? null,
        longitude:         b.longitude ?? null,
        address:           b.address ?? null,
        city:              b.city ?? null,
      }));
      setCards(realCards);
      setLoading(false);
      return;
    }

    // ── Strategy 2: Build cards entirely from customer_notifications ────────
    // customer_notifications has its own RLS (customers always read their own)
    const { data: notifs } = await sb
      .from("customer_notifications")
      .select("id, type, title, message, booking_id, data, created_at")
      .eq("user_id", user.id)
      .not("booking_id", "is", null)
      .order("created_at", { ascending: false });

    if (notifs && notifs.length > 0) {
      setCards(buildCards(notifs));
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user]);

  // Realtime — update status live
  useEffect(() => {
    if (!user) return;
    const channel = sb
      .channel("my-bookings-notifs")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "customer_notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        const n = payload.new;
        const s = NOTIF_STATUS[n.type];
        if (s === "confirmed") toast({ title: "✅ Booking Confirmed!", description: "Your provider accepted the booking." });
        else if (s === "on_the_way") toast({ title: "🚗 Provider is on the way", description: "You can now track their live location." });
        else if (s === "in_progress") toast({ title: "🚀 Service Started!", description: "Your provider has arrived." });
        else if (s === "completed") toast({ title: "🎉 Service Completed!", description: "Please leave a review." });
        loadData();
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [user]);

  const cancelBooking = async (bookingId: string) => {
    setCancellingId(bookingId);
    const { error } = await sb.from("bookings").update({
      status: "cancelled",
      cancellation_reason: "Cancelled by customer",
      cancelled_at: new Date().toISOString(),
    }).eq("id", bookingId);
    setCancellingId(null);
    if (error) {
      toast({ title: "Error cancelling", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Booking cancelled" });
    setCards(prev => prev.map(c => c.booking_id === bookingId ? { ...c, status: "cancelled" } : c));
  };

  const openReview = (card: BookingCard) => {
    setReviewBookingId(card.booking_id);
    setReviewInfo({ service: card.service_name, provider: card.provider_name, provider_id: card.provider_id });
    setReviewRating(5);
    setReviewComment("");
  };

  const submitReview = async () => {
    if (!user || !reviewBookingId) return;
    setSubmittingReview(true);

    const { data: profile } = await sb.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();

    // Try to get provider_id if we don't have it
    let pid = reviewInfo?.provider_id;
    if (!pid) {
      const { data: bk } = await sb.from("bookings").select("provider_id").eq("id", reviewBookingId).single();
      pid = bk?.provider_id ?? null;
    }

    const { error } = await sb.from("reviews").insert({
      booking_id:    reviewBookingId,
      customer_id:   user.id,
      provider_id:   pid,
      rating:        reviewRating,
      comment:       reviewComment,
      reviewer_name: profile?.full_name || user.email,
    });

    setSubmittingReview(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Review submitted! ⭐", description: "Thanks for your feedback." });
    setReviewBookingId(null);
    setReviewInfo(null);
    // Mark reviewed
    setCards(prev => prev.map(c => c.booking_id === reviewBookingId ? { ...c, has_review_prompt: false } : c));
  };

  const grouped = useMemo(() => ({
    all:       cards,
    upcoming:  cards.filter(c => ["pending", "confirmed", "on_the_way", "in_progress"].includes(c.status)),
    completed: cards.filter(c => c.status === "completed"),
    cancelled: cards.filter(c => c.status === "cancelled"),
  }), [cards]);

  const tabLabels: Record<string, string> = { all: "All", upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled" };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto pt-28 pb-16 px-4"
      >
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Bookings</h1>
            <p className="text-muted-foreground mt-1">Manage and track all your service bookings</p>
          </div>
          <Button onClick={() => navigate("/services")} className="bg-gradient-gold text-primary-foreground font-semibold hover:opacity-90">
            Book a Service
          </Button>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="mb-6 bg-secondary p-1">
            {tabs.map(tab => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="capitalize relative data-[state=active]:bg-gradient-gold data-[state=active]:text-primary-foreground"
              >
                {tabLabels[tab]}
                {grouped[tab].length > 0 && (
                  <span className="ml-1.5 bg-primary/20 text-primary text-xs rounded-full px-1.5 py-0.5 font-bold">
                    {grouped[tab].length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map(tab => (
            <TabsContent key={tab} value={tab}>
              <AnimatePresence mode="wait">
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2].map(i => (
                      <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
                        <div className="flex gap-4">
                          <div className="w-12 h-12 rounded-xl bg-secondary flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-secondary rounded w-1/3" />
                            <div className="h-3 bg-secondary rounded w-1/2" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : grouped[tab].length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-20 bg-card border border-border rounded-2xl"
                  >
                    <Package className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-foreground font-medium mb-2">No bookings here</p>
                    <p className="text-muted-foreground text-sm mb-6">
                      {tab === "all" ? "You haven't made any bookings yet." : `No ${tab} bookings found.`}
                    </p>
                    <Button onClick={() => navigate("/services")} className="bg-gradient-gold text-primary-foreground">
                      Explore Services
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    {grouped[tab].map((card, i) => {
                      const st = STATUS_LABEL[card.status] ?? STATUS_LABEL.pending;
                      const ref = `#HF-${card.booking_id.slice(0, 8).toUpperCase()}`;
                      const canCancel = ["pending", "confirmed"].includes(card.status);

                      return (
                        <motion.div
                          key={card.booking_id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="bg-card border border-border rounded-2xl p-5 hover:border-primary/20 transition-colors"
                        >
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                            {/* Left */}
                            <div className="flex gap-4">
                              {/* Status icon circle */}
                              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-xl", st.cls.split(" ").filter(c => c.startsWith("bg")).join(" "))}>
                                {st.icon}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <p className="font-semibold text-foreground">{card.service_name}</p>
                                  <Badge className={cn("text-xs border", st.cls)}>
                                    {st.label}
                                  </Badge>
                                  <AttachmentBadgeForCard bookingId={card.booking_id} />
                                </div>
                                <p className="text-xs text-muted-foreground font-mono mb-2">{ref}</p>

                                {/* Provider */}
                                <div className="flex items-center gap-2 mb-2">
                                  <Avatar className="w-5 h-5">
                                    <AvatarFallback className="bg-gradient-gold text-primary-foreground text-[10px] font-bold">
                                      {card.provider_name[0].toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm text-muted-foreground">{card.provider_name}</span>
                                </div>

                                {/* Time */}
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Calendar className="w-3 h-3" />
                                  <span>{timeAgo(card.created_at)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Right actions */}
                            <div className="flex flex-col items-start md:items-end gap-2">
                              <div className="flex flex-wrap gap-2">
                                {/* View booking confirmation */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-border text-muted-foreground hover:text-foreground"
                                  onClick={() => navigate(`/booking-confirmation/${card.booking_id}`)}
                                >
                                  View Details
                                </Button>

                                {/* Chat button */}
                                {card.has_chat && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-primary/30 text-primary hover:bg-primary/10"
                                    onClick={() => setActiveChatId(card.booking_id)}
                                  >
                                    <MessageCircle className="w-3 h-3 mr-1" /> Chat
                                  </Button>
                                )}

                                {/* Review button — completed */}
                                {card.has_review_prompt && (
                                  <Button
                                    size="sm"
                                    className="bg-gradient-gold text-primary-foreground font-semibold hover:opacity-90"
                                    onClick={() => openReview(card)}
                                  >
                                    <Star className="w-3 h-3 mr-1" /> Leave Review
                                  </Button>
                                )}

                                {/* Cancel */}
                                {canCancel && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                                    onClick={() => cancelBooking(card.booking_id)}
                                    disabled={cancellingId === card.booking_id}
                                  >
                                    {cancellingId === card.booking_id ? (
                                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    ) : (
                                      <XCircle className="w-3 h-3 mr-1" />
                                    )}
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                          {(card.status === "on_the_way" || card.status === "in_progress") && (
                            <BookingTracker
                              bookingId={card.booking_id}
                              status={card.status}
                              latitude={card.latitude}
                              longitude={card.longitude}
                            />
                          )}
                          {/* Attachment viewer — lazy, loaded when card renders */}
                          <div className="mt-3">
                            <AttachmentViewer
                              bookingId={card.booking_id}
                              lazy
                              visible
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
          ))}
        </Tabs>
      </motion.main>

      {/* ── Chat Dialog ─────────────────────────────────────────────── */}
      {activeChatId && user && (
        <Dialog open={!!activeChatId} onOpenChange={() => setActiveChatId(null)}>
          <DialogContent className="bg-card border-border p-0 max-w-md">
            <DialogHeader className="p-4 pb-0 border-b border-border">
              <DialogTitle className="text-foreground flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Chat with {cards.find(c => c.booking_id === activeChatId)?.provider_name ?? "Provider"}
              </DialogTitle>
            </DialogHeader>
            <BookingChat bookingId={activeChatId} currentUserId={user.id} senderType="customer" />
          </DialogContent>
        </Dialog>
      )}

      {/* ── Review Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!reviewBookingId} onOpenChange={() => setReviewBookingId(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rate your experience ⭐</DialogTitle>
          </DialogHeader>
          {reviewInfo && (
            <div className="space-y-5 pt-2">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">
                  {reviewInfo.service} with <span className="text-foreground font-medium">{reviewInfo.provider}</span>
                </p>
                <div className="flex justify-center mt-4">
                  <StarPicker value={reviewRating} onChange={setReviewRating} />
                </div>
                <p className="text-muted-foreground text-xs mt-2">
                  {["", "Poor", "Fair", "Good", "Great", "Excellent!"][reviewRating]}
                </p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Comment (optional)</label>
                <Textarea
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder="Share your experience..."
                  className="bg-secondary border-border"
                  rows={3}
                />
              </div>
              <Button
                onClick={submitReview}
                disabled={submittingReview}
                className="w-full bg-gradient-gold text-primary-foreground font-bold hover:opacity-90"
              >
                {submittingReview ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ChevronRight className="w-4 h-4 mr-2" />}
                {submittingReview ? "Submitting..." : "Submit Review"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default MyBookings;
