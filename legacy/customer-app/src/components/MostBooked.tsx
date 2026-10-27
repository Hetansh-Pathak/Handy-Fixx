import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import plumbingImg from "@/assets/service-plumbing.jpg";
import electricalImg from "@/assets/service-electrical.jpg";
import paintingImg from "@/assets/service-painting.jpg";
import carpentryImg from "@/assets/service-carpentry.jpg";
import hvacImg from "@/assets/service-hvac.jpg";

const imgFallback: Record<string, string> = {
  plumbing: plumbingImg, electrical: electricalImg, painting: paintingImg,
  carpentry: carpentryImg, hvac: hvacImg, "ac-service": hvacImg,
};

const MostBooked = () => {
  const navigate = useNavigate();
  const { pincode } = useApp();

  const { data: mostBooked } = useQuery({
    queryKey: ["most-booked"],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, slug, base_price, booking_count")
        .eq("is_active", true)
        .order("booking_count", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const fallback = [
    { name: "House Cleaning", slug: "cleaning",   base_price: 499, booking_count: 2100 },
    { name: "AC Service",     slug: "ac-service", base_price: 599, booking_count: 1560 },
    { name: "Plumbing",       slug: "plumbing",   base_price: 299, booking_count: 1240 },
    { name: "Electrical",     slug: "electrical", base_price: 349, booking_count: 980  },
    { name: "Painting",       slug: "painting",   base_price: 799, booking_count: 670  },
  ];

  const display = mostBooked && mostBooked.length > 0 ? mostBooked : fallback;

  return (
    <section className="py-20 bg-surface-elevated">
      <div className="container mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="flex items-center justify-between mb-10 flex-wrap gap-4">
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground">Most booked this week</h2>
          <button onClick={() => navigate("/services")}
            className="text-primary text-sm font-medium hover:underline">
            View all services →
          </button>
        </motion.div>

        <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
          {display.map((item, i) => {
            const img = imgFallback[item.slug] || plumbingImg;
            return (
              <motion.div key={item.slug || item.name} initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }} whileHover={{ y: -8 }}
                onClick={() => navigate(`/services/${item.slug}${pincode ? `?pincode=${pincode}` : ""}`)}
                className="min-w-[220px] bg-card rounded-xl overflow-hidden cursor-pointer group border border-border hover:border-primary/40 transition-colors">
                <div className="relative h-40 overflow-hidden">
                  <img src={img} alt={item.name} loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute top-2 right-2 bg-card/90 backdrop-blur-sm rounded-full px-2 py-0.5 flex items-center gap-1">
                    <Star className="w-3 h-3 fill-primary text-primary" />
                    <span className="text-xs font-bold text-foreground">4.9</span>
                  </div>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-foreground">{item.name}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-primary font-bold">From ₹{item.base_price}</span>
                    <span className="text-xs text-muted-foreground">{item.booking_count?.toLocaleString()}+ booked</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default MostBooked;
