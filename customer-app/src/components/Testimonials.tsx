import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createRequestTimeoutSignal } from "@/lib/requestTimeout";

const Testimonials = () => {
  const { data: liveTestimonials, error } = useQuery({
    queryKey: ["testimonials-home"],
    queryFn: async ({ signal }) => {
      const request = createRequestTimeoutSignal(signal);
      try {
        const { data, error: queryError } = await supabase
          .from("reviews")
          .select("rating, comment, reviewer_name")
          .gte("rating", 4)
          .not("comment", "is", null)
          .not("reviewer_name", "is", null)
          .order("created_at", { ascending: false })
          .limit(6)
          .abortSignal(request.signal);
        if (queryError) throw queryError;
        return data ?? [];
      } finally {
        request.clear();
      }
    },
  });

  const display = liveTestimonials ?? [];
  if (display.length === 0 && !error) return null;

  return (
    <section className="py-20 bg-surface-elevated">
      <div className="container mx-auto text-center">
        <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} className="text-3xl md:text-4xl font-extrabold text-foreground mb-14">
          What our customers say
        </motion.h2>

        {error ? (
          <p role="alert" className="text-sm text-muted-foreground">Customer reviews are temporarily unavailable.</p>
        ) :         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {display.slice(0, 3).map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}
              whileHover={{ y: -5 }}
              className="min-w-0 bg-card rounded-2xl p-6 text-left border border-border hover:border-primary/30 transition-colors">
              <div className="flex mb-3">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-primary text-primary" />
                ))}
              </div>
              <p className="break-words text-muted-foreground mb-4 text-sm leading-relaxed">"{t.comment}"</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                  {(t.reviewer_name || "U")[0]}
                </div>
                <div>
                  <p className="break-words font-bold text-foreground text-sm">{t.reviewer_name}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>}
      </div>
    </section>
  );
};

export default Testimonials;
