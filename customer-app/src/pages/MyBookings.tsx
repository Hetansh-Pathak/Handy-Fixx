import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CalendarDays, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BookingCard from "@/components/bookings/BookingCard";
import ReviewDialog, { type ReviewTarget } from "@/components/bookings/ReviewDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  CANCELLABLE_STATUSES, defaultTab, groupBookings, mergeRealtime, toBookingItem,
  type BookingItem, type BookingRow, type TabKey,
} from "@/lib/bookings";
import { formatSchedule } from "@/lib/dates";
import { EASE } from "@/lib/motion";

const sb = supabase as any;

const SELECT =
  "id, status, booking_date, booking_time, scheduled_date, scheduled_time, address, city, total_amount, payment_status, created_at, provider_id, provider_eta_minutes, services(name, slug)";

const TABS: { key: TabKey; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const EMPTY_COPY: Record<TabKey, { title: string; body: string }> = {
  upcoming: { title: "No upcoming bookings", body: "Book a verified pro and it will show up here." },
  completed: { title: "Nothing completed yet", body: "Finished jobs and your ratings will appear here." },
  cancelled: { title: "No cancelled bookings", body: "Anything you or a pro cancels will appear here." },
};

// What customers hear when the pro moves a booking forward (notifications are the reliable trigger).
const NOTIF_TOASTS: Record<string, { title: string; description: string }> = {
  booking_confirmed: { title: "Booking confirmed", description: "Your pro accepted the booking." },
  provider_on_the_way: { title: "Your pro is on the way", description: "Open the booking to track them live." },
  job_started: { title: "Work has started", description: "Your pro has arrived." },
  job_completed: { title: "Job complete", description: "Rate your pro when you're ready." },
};

const MyBookings = () => {
  const { user } = useAuth();
  const { refetchBookingsCount } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const [items, setItems] = useState<BookingItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<TabKey | null>(null); // null = pick automatically

  const [cancelTarget, setCancelTarget] = useState<BookingItem | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!user) return;
      if (!silent) setStatus("loading");

      const [bookingsRes, reviewsRes] = await Promise.all([
        sb.from("bookings").select(SELECT).eq("customer_id", user.id).order("created_at", { ascending: false }).limit(100),
        sb.from("reviews").select("booking_id, rating").eq("customer_id", user.id),
      ]);

      if (bookingsRes.error) {
        console.error("bookings load error:", bookingsRes.error);
        if (!silent) setStatus("error"); // a silent refresh keeps showing what we already have
        return;
      }

      const ratings = new Map<string, number>(((reviewsRes.data ?? []) as { booking_id: string; rating: number }[]).map((r) => [r.booking_id, r.rating]));
      const rows = (bookingsRes.data ?? []) as BookingRow[];
      // Customers cannot read service_providers, so pro names come from the booking_provider_info view.
      const proRes = rows.length
        ? await sb.from("booking_provider_info").select("booking_id, full_name, name").in("booking_id", rows.map((r) => r.id))
        : { data: [] };
      const pros = new Map<string, { full_name?: string | null; name?: string | null }>(
        ((proRes.data ?? []) as { booking_id: string; full_name?: string | null; name?: string | null }[]).map((p) => [p.booking_id, p]),
      );
      setItems(rows.map((row) => toBookingItem({ ...row, service_providers: pros.get(row.id) ?? null }, ratings)));
      setStatus("ready");
    },
    [user],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: status/ETA changes arrive instantly; notifications add a toast and a safety-net refresh.
  useEffect(() => {
    if (!user) return;
    const channel = sb
      .channel(`my-bookings-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `customer_id=eq.${user.id}` },
        (payload: { new: BookingRow }) => {
          setItems((prev) => mergeRealtime(prev, payload.new));
          refetchBookingsCount();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings", filter: `customer_id=eq.${user.id}` },
        () => void load(true),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customer_notifications", filter: `user_id=eq.${user.id}` },
        (payload: { new: { type: string } }) => {
          const t = NOTIF_TOASTS[payload.new.type];
          if (t) toast(t);
          void load(true);
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [user, load, toast, refetchBookingsCount]);

  // Coming back to the app (e.g. from the dialer or maps) should show fresh statuses.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const groups = useMemo(() => groupBookings(items), [items]);
  const activeTab = tab ?? defaultTab(groups);
  const list = groups[activeTab];

  const askCancel = (item: BookingItem) => {
    setCancelTarget(item);
    setCancelOpen(true);
  };

  const confirmCancel = async () => {
    const target = cancelTarget;
    if (!target || !user) return;
    setCancellingId(target.id);

    // Only cancellable states can be cancelled: if the pro just started, zero rows match.
    const { data, error } = await sb
      .from("bookings")
      .update({
        status: "cancelled",
        cancellation_reason: "Cancelled by customer",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .eq("customer_id", user.id)
      .in("status", CANCELLABLE_STATUSES)
      .select("id");
    setCancellingId(null);

    if (error) {
      toast({ title: "Couldn't cancel the booking", description: error.message, variant: "destructive" });
      return;
    }
    if (!data || data.length === 0) {
      toast({
        title: "This booking can't be cancelled now",
        description: "Your pro may have just started. Open the booking for details.",
        variant: "destructive",
      });
      void load(true);
      return;
    }
    toast({ title: "Booking cancelled" });
    setItems((prev) => prev.map((i) => (i.id === target.id ? { ...i, status: "cancelled" } : i)));
    refetchBookingsCount();
  };

  const askReview = (item: BookingItem) => {
    setReviewTarget({ bookingId: item.id, serviceName: item.serviceName, providerName: item.providerName, providerId: item.providerId });
    setReviewOpen(true);
  };

  const open = (id: string, query = "") => navigate(`/booking-confirmation/${id}${query}`);

  return (
    <div className="min-h-dvh bg-background pb-8">
      <div className="sticky top-0 z-30 border-b border-border/60 bg-background/90 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-2xl md:pt-24">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-[28px] font-extrabold tracking-tight">Bookings</h1>
            <Button size="sm" onClick={() => navigate("/services")}>
              <Plus /> Book a service
            </Button>
          </div>

          <div role="tablist" aria-label="Booking status" className="relative mt-3 grid grid-cols-3 rounded-xl bg-secondary p-1">
            {TABS.map(({ key, label }) => {
              const selected = activeTab === key;
              const count = groups[key].length;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`tab-${key}`}
                  aria-selected={selected}
                  aria-controls="bookings-panel"
                  onClick={() => setTab(key)}
                  className={`relative z-10 flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="bookings-segment"
                      transition={{ duration: 0.25, ease: EASE }}
                      className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm"
                    />
                  )}
                  {label}
                  {status === "ready" && count > 0 && (
                    <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-bold tabular-nums">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div id="bookings-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="mx-auto max-w-2xl px-5 pt-5">
        {status === "loading" && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading your bookings">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 rounded-3xl" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="space-y-4 rounded-3xl bg-secondary p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-bold">We couldn't load your bookings.</p>
                <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
              </div>
            </div>
            <Button onClick={() => void load()}>Try again</Button>
          </div>
        )}

        {status === "ready" && list.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
              <CalendarDays className="h-8 w-8" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-lg font-extrabold tracking-tight">{EMPTY_COPY[activeTab].title}</h2>
            <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{EMPTY_COPY[activeTab].body}</p>
            {activeTab === "upcoming" && (
              <Button size="lg" className="mt-6" onClick={() => navigate("/services")}>
                Browse services
              </Button>
            )}
          </div>
        )}

        {status === "ready" && list.length > 0 && (
          <motion.ul
            key={activeTab}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="space-y-4"
          >
            {list.map((item) => (
              <li key={item.id}>
                <BookingCard
                  item={item}
                  cancelling={cancellingId === item.id}
                  onOpen={() => open(item.id)}
                  onTrack={() => open(item.id)}
                  onChat={() => open(item.id, "?chat=1")}
                  onCancel={() => askCancel(item)}
                  onReview={() => askReview(item)}
                  onRebook={() => navigate(`/book/${item.serviceSlug}/${item.providerId}`)}
                />
              </li>
            ))}
          </motion.ul>
        )}
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `${cancelTarget.serviceName} with ${cancelTarget.providerName}, ${formatSchedule(cancelTarget.scheduledDate, cancelTarget.scheduledTime)}. Your pro will be told right away.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmCancel()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} target={reviewTarget} onSubmitted={() => void load(true)} />
    </div>
  );
};

export default MyBookings;
