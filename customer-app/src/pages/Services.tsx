import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronRight, Clock, MapPin, Search, X } from "lucide-react";
import { servicesQuery } from "@/lib/queries";
import { usePrefetchService } from "@/hooks/usePrefetchService";
import { getServiceIcon } from "@/lib/serviceIcons";
import { EASE, haptic } from "@/lib/motion";

type Service = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_name: string | null;
  base_price: number | null;
  duration_minutes: number | null;
  category: string | null;
};

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "home", label: "Home" },
  { value: "appliance", label: "Appliance" },
  { value: "beauty", label: "Beauty" },
];

const Services = () => {
  const [searchParams] = useSearchParams();
  const city = searchParams.get("city") || searchParams.get("pincode") || "";
  const navigate = useNavigate();
  const prefetchService = usePrefetchService();
  const { data, isPending } = useQuery(servicesQuery());
  const [category, setCategory] = useState("all");
  const [term, setTerm] = useState("");

  const list = useMemo(() => {
    const t = term.trim().toLowerCase();
    return ((data ?? []) as Service[]).filter(
      (s) =>
        (category === "all" || s.category === category) &&
        (!t || s.name.toLowerCase().includes(t) || (s.description ?? "").toLowerCase().includes(t)),
    );
  }, [data, category, term]);

  const open = (s: Service) => {
    haptic();
    navigate(`/services/${s.slug}${city ? `?pincode=${city}` : ""}`);
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Sticky header: title, search, category chips */}
      <div className="sticky top-0 z-30 border-b border-border/60 bg-background/90 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-2xl md:pt-24">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-end justify-between">
            <h1 className="text-[28px] font-extrabold tracking-tight">Services</h1>
            {city && (
              <span className="mb-1 flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                <MapPin className="h-3.5 w-3.5" /> {city}
              </span>
            )}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search services"
              className="h-12 w-full rounded-2xl bg-secondary pl-12 pr-11 text-base outline-none transition-shadow focus:ring-2 focus:ring-gold"
            />
            {term && (
              <button onClick={() => setTerm("")} aria-label="Clear" className="press absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/10">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => { haptic(4); setCategory(c.value); }}
                className={`press shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  category === c.value ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="mx-auto max-w-2xl px-5 py-4">
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-secondary" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-lg font-bold">No services found</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search or category.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {list.map((s, i) => {
              const Icon = getServiceIcon(s.icon_name);
              return (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE, delay: Math.min(i, 8) * 0.035 }}
                >
                  <button
                    onClick={() => open(s)}
                    onTouchStart={() => prefetchService(s.slug)}
                    onPointerEnter={() => prefetchService(s.slug)}
                    className="press flex w-full items-center gap-4 py-4 text-left"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                      <Icon className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold">{s.name}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[13px] text-muted-foreground">
                        {s.base_price != null && <span>From ₹{s.base_price}</span>}
                        {s.duration_minutes && (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{s.duration_minutes} min</span>
                        )}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Services;
