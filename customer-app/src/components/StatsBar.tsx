import { motion } from "framer-motion";
import { CalendarCheck, Star, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createRequestTimeoutSignal } from "@/lib/requestTimeout";

const StatsBar = () => {
  const { data: stats = [], error } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async ({ signal }) => {
      const request = createRequestTimeoutSignal(signal);
      try {
        const [providers, bookings, reviews] = await Promise.all([
          supabase.from("service_providers").select("id", { count: "exact", head: true }).eq("is_verified", true).abortSignal(request.signal),
          supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed").abortSignal(request.signal),
          supabase.from("reviews").select("rating").not("rating", "is", null).order("created_at", { ascending: false }).limit(100).abortSignal(request.signal),
        ]);

        if (providers.error) throw providers.error;
        if (bookings.error) throw bookings.error;
        if (reviews.error) throw reviews.error;

        const ratings = reviews.data.map(review => review.rating).filter((rating): rating is number => rating !== null);
        return [
          ...(providers.count !== null
            ? [{ icon: Users, value: providers.count.toLocaleString(), label: "Verified Pros" }]
            : []),
          ...(bookings.count !== null
            ? [{ icon: CalendarCheck, value: bookings.count.toLocaleString(), label: "Completed Bookings" }]
            : []),
          ...(ratings.length > 0
            ? [{
                icon: Star,
                value: `${(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)}★`,
                label: "Recent Average Rating",
              }]
            : []),
        ];
      } finally {
        request.clear();
      }
    },
  });

  if (error) {
    return (
      <p role="alert" className="bg-card py-4 text-center text-sm text-muted-foreground">
        Platform statistics could not be loaded.
      </p>
    );
  }
  if (stats.length === 0) return null;

  return (
    <section className="py-14 bg-card border-y border-border">
      <div className="container mx-auto grid grid-cols-2 md:grid-cols-3 gap-8">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="flex flex-col items-center text-center"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
              <stat.icon className="h-5 w-5 text-primary" />
            </div>
            <p className="mb-1 text-3xl font-extrabold text-foreground md:text-4xl">{stat.value}</p>
            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default StatsBar;
