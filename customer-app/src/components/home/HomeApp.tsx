import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, CalendarCheck, MapPin, Search, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { usePrefetchService } from "@/hooks/usePrefetchService";
import { getServiceIcon } from "@/lib/serviceIcons";
import { haptic, rise } from "@/lib/motion";

const FALLBACK = [
  { name: "Plumbing", slug: "plumbing", icon_name: "Wrench" },
  { name: "Electrical", slug: "electrical", icon_name: "Zap" },
  { name: "Painting", slug: "painting", icon_name: "PaintBucket" },
  { name: "Carpentry", slug: "carpentry", icon_name: "Hammer" },
  { name: "AC & HVAC", slug: "ac-service", icon_name: "Wind" },
  { name: "Cleaning", slug: "cleaning", icon_name: "Sparkles" },
  { name: "Pest Control", slug: "pest-control", icon_name: "Bug" },
  { name: "More", slug: "", icon_name: "Settings" },
];

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const HomeApp = () => {
  const navigate = useNavigate();
  const { pincode, profile, upcomingBookingsCount, unreadNotificationsCount } = useApp();
  const prefetchService = usePrefetchService();

  const { data } = useQuery({
    queryKey: ["services-grid"],
    staleTime: 1000 * 60 * 10,
    meta: { persist: true },
    queryFn: async () => {
      const { data } = await supabase.from("services").select("id, name, slug, icon_name").eq("is_active", true).limit(8);
      return data || [];
    },
  });
  const services = data && data.length > 0 ? data : FALLBACK;
  const first = profile?.full_name?.split(" ")[0];
  const q = pincode ? `?pincode=${pincode}` : "";

  return (
    <div className="min-h-dvh bg-background px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      {/* Header */}
      <motion.header {...rise(0)} className="flex items-center justify-between">
        <button
          onClick={() => navigate("/services")}
          className="press flex items-center gap-1.5 rounded-full bg-secondary py-2 pl-3 pr-4 text-sm font-semibold"
        >
          <MapPin className="h-4 w-4" />
          {pincode || "Set location"}
        </button>
        <button
          onClick={() => { haptic(); navigate("/notifications"); }}
          aria-label="Notifications"
          className="press relative flex h-11 w-11 items-center justify-center rounded-full bg-secondary"
        >
          <Bell className="h-5 w-5" />
          {unreadNotificationsCount > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-gold ring-2 ring-secondary" />}
        </button>
      </motion.header>

      {/* Headline */}
      <motion.div {...rise(1)} className="mt-8">
        <p className="text-sm font-medium text-muted-foreground">{greeting()}{first ? `, ${first}` : ""}</p>
        <h1 className="mt-1 text-[34px] font-extrabold leading-[1.1] tracking-tight">What needs<br />fixing today?</h1>
      </motion.div>

      {/* Search */}
      <motion.button
        {...rise(2)}
        onClick={() => navigate(`/services${q}`)}
        className="press mt-6 flex h-14 w-full items-center gap-3 rounded-2xl bg-secondary px-4 text-left text-base text-muted-foreground"
      >
        <Search className="h-5 w-5 text-foreground" />
        Search a service or problem
      </motion.button>

      {/* Upcoming booking */}
      {upcomingBookingsCount > 0 && (
        <motion.button
          {...rise(3)}
          onClick={() => navigate("/my-bookings")}
          className="press mt-4 flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent"><CalendarCheck className="h-5 w-5" /></span>
          <span className="flex-1">
            <span className="block text-sm font-bold">{upcomingBookingsCount} upcoming {upcomingBookingsCount > 1 ? "bookings" : "booking"}</span>
            <span className="block text-xs text-muted-foreground">Track your professional</span>
          </span>
          <ArrowRight className="h-4 w-4" />
        </motion.button>
      )}

      {/* Services */}
      <motion.section {...rise(4)} className="mt-8">
        <h2 className="mb-4 text-lg font-bold tracking-tight">Services</h2>
        <div className="grid grid-cols-4 gap-x-3 gap-y-5">
          {services.map((s, i) => {
            const Icon = getServiceIcon(s.icon_name);
            return (
              <motion.button
                key={s.slug || s.name}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.2 + i * 0.03 }}
                onTouchStart={() => s.slug && prefetchService(s.slug)}
                onClick={() => { haptic(); navigate(s.slug ? `/services/${s.slug}${q}` : `/services${q}`); }}
                className="press flex flex-col items-center gap-2"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-secondary">
                  <Icon className="h-7 w-7" strokeWidth={1.8} />
                </span>
                <span className="text-center text-[12px] font-semibold leading-tight">{s.name}</span>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      {/* Trust card */}
      <motion.div {...rise(6)} className="mt-9 overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-xs font-bold text-gold-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Verified pros
        </span>
        <h3 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight">Background-checked.<br />Fixed, fair pricing.</h3>
        <button onClick={() => navigate(`/services${q}`)} className="press mt-5 flex h-12 items-center gap-2 rounded-xl bg-background px-5 text-sm font-bold text-foreground">
          Book now <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
};

export default HomeApp;
