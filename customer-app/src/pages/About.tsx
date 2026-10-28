import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Star, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const About = () => {
  const navigate = useNavigate();

  const { data: providerCount, error: providerCountError } = useQuery({
    queryKey: ["provider-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("service_providers")
        .select("*", { count: "exact", head: true })
        .eq("is_verified", true);
      if (error) throw error;
      return count;
    },
  });

  const { data: bookingCount, error: bookingCountError } = useQuery({
    queryKey: ["booking-count-about"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count;
    },
  });

  const { data: testimonials, error: testimonialsError } = useQuery({
    queryKey: ["testimonials-about"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("rating, comment, reviewer_name, services(name)")
        .gte("rating", 4)
        .not("comment", "is", null)
        .not("reviewer_name", "is", null)
        .order("rating", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const liveStats = [
    ...(bookingCount !== undefined && bookingCount !== null
      ? [{ value: bookingCount.toLocaleString(), label: "Bookings" }]
      : []),
    ...(providerCount !== undefined && providerCount !== null
      ? [{ value: providerCount.toLocaleString(), label: "Verified providers" }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="container mx-auto text-center relative">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <p className="text-sm font-semibold text-primary tracking-widest uppercase mb-4">Our Story</p>
            <h1 className="text-4xl md:text-6xl font-extrabold text-foreground mb-6 max-w-3xl mx-auto leading-tight">
              We're <span className="text-gradient-gold">HandyFix</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
              HandyFix connects households with home-service professionals through a simple, convenient booking experience.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Button className="bg-gradient-gold text-primary-foreground font-bold px-8 py-3 rounded-xl shadow-gold hover:opacity-90"
                onClick={() => navigate("/services")}>
                Explore Services
              </Button>
              <Button variant="outline" className="border-border px-8 py-3 rounded-xl"
                onClick={() => navigate("/become-a-pro")}>
                Join as a Pro
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Live Stats */}
      {liveStats.length > 0 && <section className="py-12 bg-gradient-gold">
        <div className="container mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {liveStats.map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center">
              <p className="text-3xl md:text-4xl font-extrabold text-primary-foreground">{stat.value}</p>
              <p className="text-sm text-primary-foreground/70 font-medium mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </section>}
      {(bookingCountError || providerCountError) && (
        <p role="alert" className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
          Some live platform statistics could not be loaded.
        </p>
      )}

      {/* Mission */}
      <section className="py-20">
        <div className="container mx-auto max-w-3xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-6">Our Mission</h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              To make professional home services accessible, affordable, and trustworthy for every household in India. We believe your home deserves the best care, delivered by skilled professionals who take pride in their craft.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Testimonials from DB */}
      {((testimonials?.length ?? 0) > 0 || testimonialsError) && <section className="py-20 bg-card/50">
        <div className="container mx-auto">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-3xl md:text-4xl font-extrabold text-foreground mb-12 text-center">
            What our customers say
          </motion.h2>
          {testimonialsError ? (
            <p role="alert" className="text-center text-sm text-muted-foreground">Customer reviews are temporarily unavailable.</p>
          ) : <div className="grid md:grid-cols-3 gap-6">
            {(testimonials ?? []).slice(0, 6).map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-card border border-border rounded-2xl p-6">
                <Quote className="w-6 h-6 text-primary/40 mb-3" />
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">"{t.comment}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {t.reviewer_name?.[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{t.reviewer_name}</p>
                    <p className="text-xs text-muted-foreground">{(t.services as any)?.name}</p>
                  </div>
                  <div className="ml-auto flex">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="w-3.5 h-3.5 fill-primary text-primary" />
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>}
        </div>
      </section>}

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-4">Ready to get started?</h2>
            <p className="text-muted-foreground mb-8">Book your first service today — fast, affordable, guaranteed.</p>
            <Button className="bg-gradient-gold text-primary-foreground font-bold px-10 py-4 rounded-xl shadow-gold hover:opacity-90 text-lg"
              onClick={() => navigate("/")}>
              Book a Service →
            </Button>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;
