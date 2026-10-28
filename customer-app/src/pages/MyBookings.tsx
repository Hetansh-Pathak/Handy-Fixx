import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { cn, getErrorMessage } from "@/lib/utils";
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
  status: string | null;
  service_name: string | null;
  provider_name: string | null;
  provider_id: string | null;
  created_at: string;
  has_chat: boolean;
  has_review_prompt: boolean;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
};

function CompletionCodeCard({ bookingId }: { bookingId: string }) {
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      const { data } = await (sb as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: { code: string } | null }>;
            };
          };
        };
      }).from('booking_completion_codes').select('code').eq('booking_id', bookingId).maybeSingle();
      if (!cancelled) setCode(data?.code ?? null);
    };
    void fetch();
    return () => { cancelled = true; };
  }, [bookingId]);

  if (!code) return null;

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-foreground">🔐 Completion Code: <span className="font-mono font-bold text-sm text-primary tracking-widest">{code}</span></p>
        <p className="text-[11px] text-muted-foreground">Share with provider after work is completed</p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2.5 text-xs text-primary hover:bg-primary/20"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          toast({ title: "Code copied!" });
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied ✓" : "Copy"}
      </Button>
    </div>
  );
}

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

  const showCode = ["confirmed", "on_the_way", "in_progress"].includes(status);

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      {showCode && <CompletionCodeCard bookingId={bookingId} />}
      {status === "on_the_way" && (
        <div className="rounded-xl bg-orange-500/10 px-3 py-2 text-sm font-semibold text-orange-400">
          Provider is on the way
        </div>
      )}
      {latitude && longitude && (
        <>
          <p className="text-sm font-semibold text-foreground">Track Provider</p>
          <LiveMap
            markers={[
              { latitude, longitude, label: "Your service location", color: "gold" as const },
              ...(providerLocation ? [{ ...providerLocation, label: "Provider", color: "blue" as const }] : []),
            ]}
            height="220px"
          />
          <p className="text-xs text-muted-foreground">
            {providerLocation ? "Live provider location" : "Waiting for the provider to share their location..."}
          </p>
        </>
      )}
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
type BookingTab = typeof tabs[number];

const seenBookingStorageKey = (userId: string) => `hf_seen_bookings_${userId}`;

const readSeenBookingIds = (userId: string): Partial<Record<BookingTab, string[]>> => {
  const stored = localStorage.getItem(seenBookingStorageKey(userId));
  if (!stored) return {};

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return {};

    const storedByTab = parsed as Record<string, unknown>;
    const seen: Partial<Record<BookingTab, string[]>> = {};
    for (const tab of tabs) {
      const ids = storedByTab[tab];
      if (Array.isArray(ids)) {
        seen[tab] = ids.filter((id): id is string => typeof id === "string");
      }
    }
    return seen;
  } catch {
    return {};
  }
};

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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<BookingTab>("all");
  const [seenBookingIds, setSeenBookingIds] = useState<Partial<Record<BookingTab, string[]>>>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [reviewInfo, setReviewInfo] = useState<{ service: string | null; provider: string | null; provider_id: string | null } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const bookingsQuery = useQuery({
    queryKey: ["customer-bookings", user?.id],
    enabled: Boolean(user),
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await sb
        .from("bookings")
        .select("id, status, created_at, customer_id, provider_id, services(name), service_providers(full_name, name), latitude, longitude, address, city")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Could not load customer bookings:", error);
        throw new Error(error.message);
      }

      return (data ?? []).map((b: any): BookingCard => ({
        booking_id:        b.id,
        status:            b.status,
        service_name:      b.services?.name ?? null,
        provider_name:     b.service_providers?.full_name ?? b.service_providers?.name ?? null,
        provider_id:       b.provider_id,
        created_at:        b.created_at,
        has_chat:          ["confirmed", "on_the_way", "in_progress"].includes(b.status ?? ""),
        has_review_prompt: b.status === "completed",
        latitude:          b.latitude ?? null,
        longitude:         b.longitude ?? null,
        address:           b.address ?? null,
        city:              b.city ?? null,
      }));
    },
  });
  const cards = bookingsQuery.data ?? [];
  const loading = bookingsQuery.isLoading;
  const loadError = bookingsQuery.error ? "Your bookings could not be loaded. Please try again." : null;
  const loadData = async () => { await bookingsQuery.refetch(); };

  useEffect(() => {
    setSeenBookingIds(user ? readSeenBookingIds(user.id) : {});
  }, [user?.id]);

  const markTabSeen = (tab: BookingTab, visibleCards: BookingCard[]) => {
    if (!user) return;
    const nextSeenBookingIds = {
      ...seenBookingIds,
      [tab]: Array.from(new Set([
        ...(seenBookingIds[tab] ?? []),
        ...visibleCards.map(card => card.booking_id),
      ])),
    };
    setSeenBookingIds(nextSeenBookingIds);
    localStorage.setItem(seenBookingStorageKey(user.id), JSON.stringify(nextSeenBookingIds));
  };

  const handleTabChange = (value: string) => {
    if (tabs.includes(value as BookingTab)) setActiveTab(value as BookingTab);
  };

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
        void loadData();
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
    queryClient.setQueryData<BookingCard[]>(["customer-bookings", user?.id], previous =>
      previous?.map(c => c.booking_id === bookingId ? { ...c, status: "cancelled" } : c)
    );
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

    try {
      const { data: booking, error: bookingError } = await sb
        .from("bookings")
        .select("id, customer_id, status, provider_id, services(name)")
        .eq("id", reviewBookingId)
        .eq("customer_id", user.id)
        .single();
      if (bookingError) throw bookingError;
      if (booking.status !== "completed") throw new Error("A review can be submitted after the service is completed.");
      if (!booking.provider_id) throw new Error("This booking has no assigned provider to review.");

      const { data: existingReview, error: reviewCheckError } = await sb
        .from("reviews")
        .select("id")
        .eq("booking_id", booking.id)
        .maybeSingle();
      if (reviewCheckError) throw reviewCheckError;
      if (existingReview) throw new Error("A review has already been submitted for this booking.");

      const { error } = await sb.from("reviews").insert({
        booking_id: reviewBookingId,
        customer_id: booking.customer_id,
        user_id: user.id,
        provider_id: booking.provider_id,
        rating: reviewRating,
        comment: reviewComment || null,
        service_name: booking.services?.name ?? null,
      });
      if (error?.code === "23505") throw new Error("A review has already been submitted for this booking.");
      if (error) throw error;

      toast({ title: "Review submitted! ⭐", description: "Thanks for your feedback." });
      setReviewBookingId(null);
      setReviewInfo(null);
      queryClient.setQueryData<BookingCard[]>(["customer-bookings", user?.id], previous =>
        previous?.map(c => c.booking_id === reviewBookingId ? { ...c, has_review_prompt: false } : c)
      );
    } catch (error: unknown) {
      toast({ title: "Error", description: getErrorMessage(error, "Could not submit your review."), variant: "destructive" });
    } finally {
      setSubmittingReview(false);
    }
  };

  const grouped = useMemo(() => ({
    all:       cards,
    upcoming:  cards.filter(c => ["pending", "confirmed", "on_the_way", "in_progress"].includes(c.status ?? "")),
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

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 bg-secondary p-1">
            {tabs.map(tab => (
              <TabsTrigger
                key={tab}
                value={tab}
                onClick={() => markTabSeen(tab, grouped[tab])}
                className="capitalize relative data-[state=active]:bg-gradient-gold data-[state=active]:text-primary-foreground"
              >
                {tabLabels[tab]}
                {grouped[tab].filter(card => !(seenBookingIds[tab] ?? []).includes(card.booking_id)).length > 0 && (
                  <span className="ml-1.5 bg-primary/20 text-primary text-xs rounded-full px-1.5 py-0.5 font-bold">
                    {grouped[tab].filter(card => !(seenBookingIds[tab] ?? []).includes(card.booking_id)).length}
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
                ) : loadError ? (
                  <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-destructive">
                    {loadError}
                    <Button variant="outline" className="ml-3" onClick={() => void loadData()}>Retry</Button>
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
                      const st = STATUS_LABEL[card.status ?? ""] ?? {
                        label: "Status unavailable",
                        cls: "bg-secondary text-muted-foreground border-border",
                        icon: "•",
                      };
                      const ref = `#HF-${card.booking_id.slice(0, 8).toUpperCase()}`;
                      const canCancel = ["pending", "confirmed"].includes(card.status ?? "");

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
                                  {card.service_name && <p className="font-semibold text-foreground">{card.service_name}</p>}
                                  <Badge className={cn("text-xs border", st.cls)}>
                                    {st.label}
                                  </Badge>
                                  <AttachmentBadgeForCard bookingId={card.booking_id} />
                                </div>
                                <p className="text-xs text-muted-foreground font-mono mb-2">{ref}</p>

                                {/* Provider */}
                                {card.provider_name && <div className="flex items-center gap-2 mb-2">
                                  <Avatar className="w-5 h-5">
                                    <AvatarFallback className="bg-gradient-gold text-primary-foreground text-[10px] font-bold">
                                      {card.provider_name[0].toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm text-muted-foreground">{card.provider_name}</span>
                                </div>}

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
                {cards.find(c => c.booking_id === activeChatId)?.provider_name
                  ? `Chat with ${cards.find(c => c.booking_id === activeChatId)?.provider_name}`
                  : "Booking chat"}
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
                {(reviewInfo.service || reviewInfo.provider) && (
                  <p className="text-muted-foreground text-sm">
                    {reviewInfo.service}{reviewInfo.service && reviewInfo.provider ? " with " : ""}
                    {reviewInfo.provider && <span className="text-foreground font-medium">{reviewInfo.provider}</span>}
                  </p>
                )}
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
