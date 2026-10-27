import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell, CheckCircle2, Car, Rocket, Star, X, MessageCircle,
  Info, Package, Check
} from "lucide-react";

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

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  booking_confirmed:   { icon: CheckCircle2,  color: "text-green-400",   bg: "bg-green-500/10" },
  provider_on_the_way: { icon: Car,           color: "text-blue-400",    bg: "bg-blue-500/10" },
  job_started:         { icon: Rocket,        color: "text-purple-400",  bg: "bg-purple-500/10" },
  job_completed:       { icon: Star,          color: "text-yellow-400",  bg: "bg-yellow-500/10" },
  booking_cancelled:   { icon: X,             color: "text-red-400",     bg: "bg-red-500/10" },
  new_message:         { icon: MessageCircle, color: "text-primary",     bg: "bg-primary/10" },
  review_reminder:     { icon: Star,          color: "text-yellow-400",  bg: "bg-yellow-500/10" },
  system:              { icon: Info,          color: "text-muted-foreground", bg: "bg-secondary" },
};

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const sb = supabase; // customer_notifications is now in generated types

const CustomerNotifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await sb
      .from("customer_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setNotifications(data as CustomerNotification[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();

    if (!user) return;
    const channel = supabase
      .channel("customer-notifs-page")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as CustomerNotification;
          setNotifications((prev) => [n, ...prev]);
          toast({ title: n.title, description: n.message });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await sb
      .from("customer_notifications")
      .update({ is_read: true })
      .eq("user_id", user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const markOneRead = async (id: string) => {
    await sb.from("customer_notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleClick = async (notif: CustomerNotification) => {
    await markOneRead(notif.id);
    if (!notif.booking_id) return;

    // Route based on type for direct deep-links
    switch (notif.type) {
      case 'job_completed':
      case 'review_reminder':
        // Go to booking confirmation — review dialog is there
        navigate(`/booking-confirmation/${notif.booking_id}`);
        break;
      case 'new_message':
        // Go to booking confirmation — chat is available there
        navigate(`/booking-confirmation/${notif.booking_id}?chat=1`);
        break;
      default:
        // All other booking notifications → booking confirmation
        navigate(`/booking-confirmation/${notif.booking_id}`);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto pt-28 pb-16 px-4 max-w-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Bell className="w-7 h-7 text-primary" />
              Notifications
              {unreadCount > 0 && (
                <span className="bg-primary text-primary-foreground text-sm font-bold rounded-full px-2.5 py-0.5">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-muted-foreground mt-1">Stay up to date with your bookings</p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-border flex items-center gap-2"
              onClick={markAllRead}
            >
              <Check className="w-3.5 h-3.5" /> Mark all read
            </Button>
          )}
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-secondary flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-secondary rounded w-1/2" />
                  <div className="h-3 bg-secondary rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24 bg-card border border-border rounded-2xl"
          >
            <Package className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-foreground font-medium mb-2">No notifications yet</p>
            <p className="text-muted-foreground text-sm">Book a service to get started</p>
            <Button
              className="mt-6 bg-gradient-gold text-primary-foreground font-semibold"
              onClick={() => navigate("/services")}
            >
              Explore Services
            </Button>
          </motion.div>
        )}

        <AnimatePresence>
          <div className="space-y-2">
            {notifications.map((notif, i) => {
              const cfg = typeConfig[notif.type] ?? typeConfig.system;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => handleClick(notif)}
                  className={`relative bg-card border rounded-2xl p-4 flex gap-4 cursor-pointer hover:border-primary/30 transition-all duration-200 ${
                    notif.is_read ? "border-border" : "border-primary/40 bg-primary/5"
                  }`}
                >
                  {!notif.is_read && (
                    <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary" />
                  )}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                    <Icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm mb-0.5">{notif.title}</p>
                    <p className="text-muted-foreground text-sm line-clamp-2">{notif.message}</p>
                    <p className="text-muted-foreground text-xs mt-1">{timeAgo(notif.created_at)}</p>

                    {/* Action buttons */}
                    {notif.booking_id && (
                      <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                        {(notif.type === 'job_completed' || notif.type === 'review_reminder') && (
                          <button
                            onClick={() => navigate(`/booking-confirmation/${notif.booking_id}`)}
                            className="text-xs bg-warning/10 border border-warning/30 text-warning font-semibold px-3 py-1 rounded-full hover:bg-warning/20 transition-colors"
                          >
                            ⭐ Leave Review
                          </button>
                        )}
                        {notif.type === 'new_message' && (
                          <button
                            onClick={() => navigate(`/booking-confirmation/${notif.booking_id}?chat=1`)}
                            className="text-xs bg-primary/10 border border-primary/30 text-primary font-semibold px-3 py-1 rounded-full hover:bg-primary/20 transition-colors"
                          >
                            💬 Open Chat
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/booking-confirmation/${notif.booking_id}`)}
                          className="text-xs bg-secondary border border-border text-muted-foreground font-medium px-3 py-1 rounded-full hover:text-foreground transition-colors"
                        >
                          View Booking →
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      </motion.main>
      <Footer />
    </div>
  );
};

export default CustomerNotifications;
