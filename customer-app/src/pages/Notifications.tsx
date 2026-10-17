import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bell, Check, ChevronRight, Info, MessageCircle, Navigation, Star, Wrench, X, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TONE_TILE, type Tone } from "@/lib/bookings";
import { dayGroup, timeAgo, type DayGroup } from "@/lib/dates";
import { cn } from "@/lib/utils";

type CustomerNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  booking_id: string | null;
  is_read: boolean;
  data: Record<string, unknown>;
  created_at: string;
};

/** Same colour language as booking statuses: gold needs you, ink is live, green is good news, red is a problem. */
const TYPES: Record<string, { Icon: LucideIcon; tone: Tone; action?: string }> = {
  booking_confirmed: { Icon: Check, tone: "green", action: "View booking" },
  provider_on_the_way: { Icon: Navigation, tone: "ink", action: "Track your pro" },
  job_started: { Icon: Wrench, tone: "ink", action: "View booking" },
  job_completed: { Icon: Star, tone: "gold", action: "Rate your pro" },
  review_reminder: { Icon: Star, tone: "gold", action: "Rate your pro" },
  booking_cancelled: { Icon: X, tone: "red", action: "View booking" },
  new_message: { Icon: MessageCircle, tone: "ink", action: "Open chat" },
  system: { Icon: Info, tone: "neutral" },
};

const GROUP_ORDER: DayGroup[] = ["Today", "Yesterday", "Earlier"];

const sb = supabase;

const Notifications = () => {
  const { user } = useAuth();
  const { refetchNotificationsCount } = useApp();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [items, setItems] = useState<CustomerNotification[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(
    async (silent = false) => {
      if (!user) return;
      if (!silent) setStatus("loading");
      const { data, error } = await sb
        .from("customer_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("notifications load error:", error);
        if (!silent) setStatus("error");
        return;
      }
      setItems((data ?? []) as CustomerNotification[]);
      setStatus("ready");
    },
    [user],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`customer-notifs-page-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customer_notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as CustomerNotification;
          setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
          toast({ title: n.title, description: n.message });
          refetchNotificationsCount();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, toast, refetchNotificationsCount]);

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const grouped = useMemo(() => {
    const now = new Date();
    const map: Record<DayGroup, CustomerNotification[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const n of items) map[dayGroup(n.created_at, now)].push(n);
    return GROUP_ORDER.filter((g) => map[g].length > 0).map((g) => ({ label: g, rows: map[g] }));
  }, [items]);

  // Optimistic: update the screen immediately, undo if the database says no.
  const markRead = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    const before = items;
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
    const { error } = await sb.from("customer_notifications").update({ is_read: true }).eq("user_id", user.id).in("id", ids);
    if (error) {
      setItems(before);
      toast({ title: "Couldn't mark as read", description: "Check your connection and try again.", variant: "destructive" });
      return;
    }
    refetchNotificationsCount(); // keeps the tab-bar badge in step
  };

  const open = (n: CustomerNotification) => {
    if (!n.is_read) void markRead([n.id]);
    if (!n.booking_id) return;
    navigate(`/booking-confirmation/${n.booking_id}${n.type === "new_message" ? "?chat=1" : ""}`);
  };

  return (
    <div className="min-h-dvh bg-background pb-8">
      <div className="sticky top-0 z-30 border-b border-border/60 bg-background/90 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-2xl md:pt-24">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <h1 className="text-[28px] font-extrabold tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void markRead(items.filter((n) => !n.is_read).map((n) => n.id))}
            >
              <Check /> Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5 pt-4">
        {status === "loading" && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading notifications">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="space-y-4 rounded-3xl bg-secondary p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-bold">We couldn't load your notifications.</p>
                <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
              </div>
            </div>
            <Button onClick={() => void load()}>Try again</Button>
          </div>
        )}

        {status === "ready" && items.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
              <Bell className="h-8 w-8" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-lg font-extrabold tracking-tight">You're all caught up</h2>
            <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
              Updates about your bookings, messages from pros and reminders will show up here.
            </p>
            <Button size="lg" className="mt-6" onClick={() => navigate("/services")}>
              Browse services
            </Button>
          </div>
        )}

        {status === "ready" &&
          grouped.map(({ label, rows }) => (
            <section key={label} aria-labelledby={`group-${label}`} className="mt-5 first:mt-1">
              <h2 id={`group-${label}`} className="mb-2 px-1 text-sm font-bold text-muted-foreground">
                {label}
              </h2>
              <ul className="space-y-2">
                {rows.map((n) => {
                  const cfg = TYPES[n.type] ?? TYPES.system;
                  const clickable = Boolean(n.booking_id) || !n.is_read;
                  const Row = clickable ? "button" : "div";
                  return (
                    <li key={n.id}>
                      <Row
                        {...(clickable ? { type: "button" as const, onClick: () => open(n) } : {})}
                        className={cn(
                          "flex w-full gap-3.5 rounded-2xl p-3.5 text-left transition-colors",
                          n.is_read ? "bg-card" : "bg-accent",
                          clickable && "press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", TONE_TILE[cfg.tone])} aria-hidden="true">
                          <cfg.Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={cn("text-[15px] leading-snug", n.is_read ? "font-semibold" : "font-extrabold")}>
                              {n.title}
                              {!n.is_read && <span className="sr-only"> (unread)</span>}
                            </span>
                            <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.message}</span>
                          {n.booking_id && cfg.action && (
                            <span className="mt-2 inline-flex items-center gap-0.5 text-sm font-bold">
                              {cfg.action}
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </span>
                          )}
                        </span>
                      </Row>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
};

export default Notifications;
