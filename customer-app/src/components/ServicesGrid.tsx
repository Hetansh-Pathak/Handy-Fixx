import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Wrench, Zap, Sparkles, PaintBucket, Wind, Hammer, Bug, Settings, Scissors, Thermometer } from "lucide-react";
import plumbingImg from "@/assets/service-plumbing.jpg";
import electricalImg from "@/assets/service-electrical.jpg";
import paintingImg from "@/assets/service-painting.jpg";
import carpentryImg from "@/assets/service-carpentry.jpg";
import hvacImg from "@/assets/service-hvac.jpg";
import cleaningImg from "@/assets/service-cleaning.jpg";
import pestImg from "@/assets/service-pest.jpg";

const iconMap: Record<string, React.ElementType> = {
  Wrench, Zap, Sparkles, PaintBucket, Wind, Hammer, Bug, Settings, Scissors, Thermometer,
};

const imgFallback: Record<string, string> = {
  plumbing: plumbingImg, electrical: electricalImg, painting: paintingImg,
  carpentry: carpentryImg, hvac: hvacImg, cleaning: cleaningImg, "pest-control": pestImg,
};

const ServicesGrid = () => {
  const navigate = useNavigate();
  const { pincode } = useApp();

  const { data: services } = useQuery({
    queryKey: ["services-grid"],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("id, name, slug, icon_name").eq("is_active", true).limit(8);
      return data || [];
    },
  });

  // Fallback static list for display before DB loads
  const display = services && services.length > 0
    ? services
    : [
        { name: "Plumbing", slug: "plumbing", icon_name: "Wrench" },
        { name: "Electrical", slug: "electrical", icon_name: "Zap" },
        { name: "Painting", slug: "painting", icon_name: "PaintBucket" },
        { name: "Carpentry", slug: "carpentry", icon_name: "Hammer" },
        { name: "AC & HVAC", slug: "ac-service", icon_name: "Wind" },
        { name: "Cleaning", slug: "cleaning", icon_name: "Sparkles" },
        { name: "Pest Control", slug: "pest-control", icon_name: "Bug" },
      ];

  return (
    <section className="py-20" id="services">
      <div className="container mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3">Every home service, one tap away</h2>
          <p className="text-muted-foreground text-lg">Trusted professionals for every corner of your home</p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {display.map((service, i) => {
            const img = imgFallback[service.slug] || plumbingImg;
            return (
              <motion.div key={service.slug || service.name} initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }} whileHover={{ scale: 1.05, y: -5 }}
                onClick={() => navigate(`/services/${service.slug}${pincode ? `?pincode=${pincode}` : ""}`)}
                className="group relative rounded-xl overflow-hidden cursor-pointer aspect-square">
                <img src={img} alt={service.name} loading="lazy" width={512} height={512}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <p className="text-foreground font-bold text-lg">{service.name}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ServicesGrid;
