import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { useActiveServices } from "@/hooks/useActiveServices";
import { Button } from "@/components/ui/button";
import plumbingImg from "@/assets/service-plumbing.jpg";
import electricalImg from "@/assets/service-electrical.jpg";
import paintingImg from "@/assets/service-painting.jpg";
import carpentryImg from "@/assets/service-carpentry.jpg";
import hvacImg from "@/assets/service-hvac.jpg";
import cleaningImg from "@/assets/service-cleaning.jpg";
import pestImg from "@/assets/service-pest.jpg";

const imgFallback: Record<string, string> = {
  plumbing: plumbingImg, electrical: electricalImg, painting: paintingImg,
  carpentry: carpentryImg, hvac: hvacImg, cleaning: cleaningImg, "pest-control": pestImg,
};

const ServicesGrid = () => {
  const navigate = useNavigate();
  const { pincode } = useApp();
  const { data: services = [], error, isPending, refetch } = useActiveServices();

  return (
    <section className="py-20" id="services">
      <div className="container mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3">Every home service, one tap away</h2>
          <p className="text-muted-foreground text-lg">Trusted professionals for every corner of your home</p>
        </motion.div>

        {isPending ? (
          <div className="fluid-card-grid grid gap-4" aria-label="Loading services" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">Services could not be loaded. Check your connection and try again.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : services.length === 0 ? (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No services are currently available.</p>
        ) : (
          <div className="fluid-card-grid grid gap-4">
            {services.slice(0, 8).map((service, i) => {
            const img = imgFallback[service.slug ?? ""];
            return (
              <motion.div key={service.id} initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }} whileHover={{ scale: 1.05, y: -5 }}
                onClick={() => navigate(`/services/${service.slug ?? service.id}${pincode ? `?pincode=${pincode}` : ""}`)}
                className={`group relative rounded-xl overflow-hidden cursor-pointer aspect-square ${img ? "" : "bg-secondary"}`}>
                {img && <img src={img} alt={service.name} loading="lazy" width={512} height={512}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />}
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <p className="text-foreground font-bold text-lg">{service.name}</p>
                </div>
              </motion.div>
            );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default ServicesGrid;
