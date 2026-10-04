import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const fallbackTestimonials = [
  { reviewer_name: "Priya Sharma", role: "Homeowner", comment: "HandyFix saved my weekend! The plumber arrived in 30 minutes and fixed everything perfectly. Highly recommend!", rating: 5 },
  { reviewer_name: "Rahul Mehta", role: "Business Owner", comment: "I use HandyFix for all my office repairs. Reliable, fast, and their pricing is always transparent.", rating: 5 },
  { reviewer_name: "Kavya Iyer", role: "Apartment Renter", comment: "Finally a service app that actually works. Knew exactly when my pro would arrive. The cleaning was spotless!", rating: 5 },
];

const Testimonials = () => {
  const { data: liveTestimonials } = useQuery({
    queryKey: ["testimonials-home"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reviews")
        .select("rating, comment, reviewer_name")
        .gte("rating", 4)
        .not("comment", "is", null)
        .order("created_at", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  const display = liveTestimonials && liveTestimonials.length >= 2
    ? liveTestimonials
    : fallbackTestimonials;

  return (
    <section className="py-20 bg-surface-elevated">
      <div className="container mx-auto text-center">
        <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} className="text-3xl md:text-4xl font-extrabold text-foreground mb-14">
          What our customers say
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-6">
          {display.slice(0, 3).map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.15 }}
              whileHover={{ y: -5 }}
              className="bg-card rounded-2xl p-6 text-left border border-border hover:border-primary/30 transition-colors">
              <div className="flex mb-3">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-muted-foreground mb-4 text-sm leading-relaxed">"{t.comment}"</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                  {(t.reviewer_name || "U")[0]}
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">{t.reviewer_name || "Customer"}</p>
                  <p className="text-xs text-muted-foreground">{(t as any).role || "HandyFix User"}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
