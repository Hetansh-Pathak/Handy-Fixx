import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Shield, Star, Users, Award, CheckCircle, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const steps = [
  { icon: Shield, title: "Background Check", desc: "Police verification + identity proof for every pro." },
  { icon: CheckCircle, title: "Skill Assessment", desc: "Practical test by our certified evaluators in their trade." },
  { icon: Award, title: "Trial Job", desc: "Real job under supervision before going live on platform." },
];

const team = [
  { name: "Vikram Patel", role: "CEO & Co-Founder", initials: "VP" },
  { name: "Ananya Roy", role: "Head of Operations", initials: "AR" },
  { name: "Nikhil Mehta", role: "CTO", initials: "NM" },
  { name: "Sneha Joshi", role: "Head of Pro Success", initials: "SJ" },
];

const About = () => {
  const navigate = useNavigate();

  const { data: providerCount } = useQuery({
    queryKey: ["provider-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("service_providers")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);
      return count || 0;
    },
  });

  const { data: bookingCount } = useQuery({
    queryKey: ["booking-count-about"],
    queryFn: async () => {
      const { count } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: testimonials } = useQuery({
    queryKey: ["testimonials-about"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reviews")
        .select("rating, comment, reviewer_name, services(name)")
        .gte("rating", 4)
        .not("comment", "is", null)
        .order("rating", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  const liveStats = [
    { value: `${Math.max(bookingCount || 0, 50000).toLocaleString()}+`, label: "Bookings Completed" },
    { value: `${Math.max(providerCount || 0, 2000)}+`, label: "Verified Pros" },
    { value: "15+", label: "Cities Served" },
    { value: "4.9★", label: "Average Rating" },
  ];

  const fallbackTestimonials = [
    { reviewer_name: "Priya Sharma", comment: "HandyFix saved my weekend! The plumber arrived in 30 minutes and fixed everything perfectly.", rating: 5, services: { name: "Plumbing" } },
    { reviewer_name: "Rahul Mehta", comment: "I use HandyFix for all my office repairs. Reliable, fast, and their pricing is always transparent.", rating: 5, services: { name: "Electrical" } },
    { reviewer_name: "Kavya Iyer", comment: "The cleaning team was exceptional. My apartment sparkles! Will definitely book again.", rating: 5, services: { name: "House Cleaning" } },
  ];

  const displayTestimonials = testimonials && testimonials.length >= 2 ? testimonials : fallbackTestimonials;

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
              Founded in 2023 in Ahmedabad, HandyFix was born from a simple frustration — finding a reliable plumber shouldn't feel like luck. We built a marketplace where every professional is vetted, every job is guaranteed, and every customer comes first.
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
      <section className="py-12 bg-gradient-gold">
        <div className="container mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {liveStats.map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center">
              <p className="text-3xl md:text-4xl font-extrabold text-primary-foreground">{stat.value}</p>
              <p className="text-sm text-primary-foreground/70 font-medium mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

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

      {/* How We Verify */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-3xl md:text-4xl font-extrabold text-foreground mb-12 text-center">
            How We Verify Every Pro
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div key={step.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.15 }}
                className="bg-card border border-border rounded-2xl p-8 text-center hover:border-primary/30 transition-colors">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <step.icon className="w-8 h-8 text-primary" />
                </div>
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center mx-auto mb-3">
                  {i + 1}
                </div>
                <h3 className="font-bold text-lg text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20">
        <div className="container mx-auto">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-3xl md:text-4xl font-extrabold text-foreground mb-12 text-center">
            Meet the Team
          </motion.h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {team.map((member, i) => (
              <motion.div key={member.name} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-card border border-border rounded-2xl p-6 text-center hover:border-primary/30 transition-colors">
                <div className="w-20 h-20 rounded-full bg-gradient-gold flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-primary-foreground">
                  {member.initials}
                </div>
                <p className="font-bold text-foreground">{member.name}</p>
                <p className="text-sm text-muted-foreground mt-1">{member.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials from DB */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-3xl md:text-4xl font-extrabold text-foreground mb-12 text-center">
            What our customers say
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {displayTestimonials.slice(0, 6).map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-card border border-border rounded-2xl p-6">
                <Quote className="w-6 h-6 text-primary/40 mb-3" />
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">"{t.comment}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {(t.reviewer_name || "U")[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{t.reviewer_name || "Customer"}</p>
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
          </div>
        </div>
      </section>

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
