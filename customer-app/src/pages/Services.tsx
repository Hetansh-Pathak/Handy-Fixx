import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Clock, ChevronRight, Wrench, Zap, Sparkles, PaintBucket, Wind, Hammer, Bug, Thermometer, Settings, Scissors, Search, Briefcase, ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useActiveServices } from "@/hooks/useActiveServices";

const iconMap: Record<string, React.ReactNode> = {
  Wrench: <Wrench className="w-6 h-6" />,
  Zap: <Zap className="w-6 h-6" />,
  Sparkles: <Sparkles className="w-6 h-6" />,
  PaintBucket: <PaintBucket className="w-6 h-6" />,
  Wind: <Wind className="w-6 h-6" />,
  Hammer: <Hammer className="w-6 h-6" />,
  Bug: <Bug className="w-6 h-6" />,
  Thermometer: <Thermometer className="w-6 h-6" />,
  Settings: <Settings className="w-6 h-6" />,
  Scissors: <Scissors className="w-6 h-6" />,
};

const categories = [
  { value: "all", label: "All Services" },
  { value: "home", label: "Home" },
  { value: "appliance", label: "Appliance" },
  { value: "beauty", label: "Beauty" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const SLIDES = [
  {
    id: 0,
    tag: "EXPLORE SERVICES",
    tagColor: "bg-primary/20 text-primary-foreground",
    title: ["Find help for", "your home."],
    titleAccent: [false, true],
    body: "Browse available home-service categories and choose an option that fits your needs.",
    cta: "Browse services",
    ctaPath: "/services",
    bg: "from-primary/80 to-primary",
    textColor: "text-primary-foreground",
    accentColor: "text-white",
    Icon: Wrench,
    iconBg: "text-primary-foreground/30",
  },
  {
    id: 1,
    tag: "LIVE TRACKING",
    tagColor: "bg-emerald-500/30 text-emerald-200",
    title: ["Watch your pro", "arrive in real time."],
    titleAccent: [false, true],
    body: "From accepted to on-the-way, track your professional's location live — no guessing, no waiting around.",
    cta: "See how it works",
    ctaPath: "/",
    bg: "from-gray-900 to-gray-800",
    textColor: "text-white",
    accentColor: "text-emerald-400",
    Icon: MapPin,
    iconBg: "text-emerald-500/20",
  },
  {
    id: 2,
    tag: "PROVIDER SIGN-UP",
    tagColor: "bg-yellow-500/30 text-yellow-100",
    title: ["Turn your skills into", "daily income."],
    titleAccent: [false, true],
    body: "Explore the provider application and manage your professional profile through HandyFix.",
    cta: "Apply as a pro",
    ctaPath: "/become-a-pro",
    bg: "from-yellow-950 to-amber-900",
    textColor: "text-white",
    accentColor: "text-yellow-400",
    Icon: Briefcase,
    iconBg: "text-yellow-500/20",
  },
];

const Services = () => {
  const [searchParams] = useSearchParams();
  const city = searchParams.get("city") || searchParams.get("pincode") || "";
  const { data: services = [], isPending: loading, isFetching, error, refetch } = useActiveServices();
  const navigate = useNavigate();
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const nextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    intervalRef.current = setInterval(nextSlide, 4500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused, nextSlide]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* City banner */}
      <div className="pt-20 bg-secondary/50 border-b border-border">
        <div className="container mx-auto py-3 flex items-center gap-3 flex-wrap">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
          {city ? (
            <span className="text-sm text-muted-foreground">
              Showing services in{" "}
              <span className="text-foreground font-semibold">{city}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">All services (no city selected)</span>
          )}
          <button
            onClick={() => navigate("/")}
            className="text-primary text-sm hover:underline flex items-center gap-1"
          >
            <Search className="w-3 h-3" /> Change city
          </button>
        </div>
      </div>

      <div className="container mx-auto py-10 px-4">
        {/* ── Promo Banner Carousel ── */}
        <div
          className="relative mb-10 rounded-2xl overflow-hidden select-none"
          style={{ minHeight: 200 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <AnimatePresence mode="wait">
            {SLIDES.map((slide, idx) =>
              idx === activeSlide ? (
                <motion.div
                  key={slide.id}
                  initial={{ opacity: 0, x: 60 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -60 }}
                  transition={{ duration: 0.45, ease: "easeInOut" }}
                  className={`bg-gradient-to-br ${slide.bg} rounded-2xl p-8 md:p-10 flex items-center justify-between gap-6 min-h-[200px]`}
                >
                  {/* Text side */}
                  <div className="flex-1 min-w-0">
                    <span className={`inline-block text-xs font-bold tracking-widest px-3 py-1 rounded-full mb-4 ${slide.tagColor}`}>
                      {slide.tag}
                    </span>
                    <h2 className={`text-2xl md:text-3xl lg:text-4xl font-extrabold leading-tight mb-3 ${slide.textColor}`}>
                      {slide.title[0]}{" "}
                      <span className={slide.accentColor}>{slide.title[1]}</span>
                    </h2>
                    <p className={`text-sm md:text-base mb-5 max-w-md opacity-80 ${slide.textColor}`}>
                      {slide.body}
                    </p>
                    <button
                      onClick={() => navigate(slide.ctaPath)}
                      className={`inline-flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl border-2 transition-all duration-200 hover:gap-3 bg-transparent ${slide.textColor} border-current hover:bg-white/10`}
                    >
                      {slide.cta} <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Icon side */}
                  <div className="hidden md:flex flex-shrink-0 items-center justify-center w-40 h-40">
                    <slide.Icon
                      className={`w-32 h-32 ${slide.iconBg}`}
                      strokeWidth={0.8}
                    />
                  </div>
                </motion.div>
              ) : null
            )}
          </AnimatePresence>

          {/* Dot navigation */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
            {SLIDES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSlide(idx)}
                className={`transition-all duration-300 rounded-full ${
                  idx === activeSlide
                    ? "w-6 h-2.5 bg-white"
                    : "w-2.5 h-2.5 bg-white/40 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        </div>

        <Tabs defaultValue="all">
          <div className="flex justify-center mb-8">
            <TabsList className="bg-secondary p-1">
              {categories.map((cat) => (
                <TabsTrigger
                  key={cat.value}
                  value={cat.value}
                  className="capitalize data-[state=active]:bg-gradient-gold data-[state=active]:text-primary-foreground"
                >
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {categories.map((cat) => (
            <TabsContent key={cat.value} value={cat.value}>
              {error ? (
                <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-12 text-center">
                  <p className="text-sm text-muted-foreground">Services could not be loaded. Check your connection and try again.</p>
                  <Button type="button" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                    {isFetching ? "Trying again..." : "Try again"}
                  </Button>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {loading ? (
                  <motion.div
                    key="skeleton"
                    className="fluid-card-grid grid gap-6"
                  >
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="bg-card border border-border rounded-2xl p-5 animate-pulse"
                      >
                        <div className="w-12 h-12 rounded-xl bg-secondary mb-4" />
                        <div className="h-4 bg-secondary rounded mb-2" />
                        <div className="h-3 bg-secondary rounded mb-3 w-3/4" />
                        <div className="h-4 bg-secondary rounded w-1/2" />
                      </div>
                    ))}
                  </motion.div>
                  ) : (
                  <motion.div
                    key={cat.value}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="fluid-card-grid grid gap-6"
                  >
                    {services
                      .filter((s) => cat.value === "all" || s.category === cat.value)
                      .map((service) => (
                        <motion.div
                          key={service.id}
                          variants={cardVariants}
                          onClick={() =>
                            navigate(`/services/${service.slug ?? service.id}?city=${city}`)
                          }
                          className="bg-card border border-border rounded-2xl p-5 cursor-pointer hover:border-primary/50 hover:shadow-gold hover:-translate-y-1 transition-all duration-300 group"
                        >
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors text-primary">
                            {service.icon_name && iconMap[service.icon_name]
                              ? iconMap[service.icon_name]
                              : <Wrench className="w-6 h-6" />}
                          </div>
                          <h3 className="font-semibold text-foreground mb-1">{service.name}</h3>
                          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                            {service.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <p className="text-primary font-bold text-sm">
                              From ₹{service.base_price}
                            </p>
                            {service.duration_minutes && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {service.duration_minutes}m
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-3 text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            View providers <ChevronRight className="w-3 h-3" />
                          </div>
                        </motion.div>
                      ))}
                    {services.filter((s) => cat.value === "all" || s.category === cat.value).length === 0 && (
                      <div className="col-span-full text-center py-16 text-muted-foreground">
                        <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium">No services in this category yet</p>
                      </div>
                    )}
                  </motion.div>
                  )}
                </AnimatePresence>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Popular CTA */}
        {!loading && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-16 bg-card border border-border rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Can't find what you need?</h2>
              <p className="text-muted-foreground">
                Our team can connect you with the right professional for any job.
              </p>
            </div>
            <Button
              className="bg-gradient-gold text-primary-foreground font-bold px-8 py-3 rounded-xl shadow-gold hover:opacity-90 transition-opacity flex-shrink-0"
              onClick={() => navigate("/")}
            >
              Contact Support
            </Button>
          </motion.div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Services;
