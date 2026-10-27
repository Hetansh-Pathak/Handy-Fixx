import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Apple, Play } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-20 bg-gradient-gold relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,hsl(35_100%_40%_/_0.5),transparent_60%)]" />
      <div className="container mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-5xl font-extrabold text-primary-foreground mb-4">
            Book in 60 seconds.
            <br />
            Track in real time.
          </h2>
          <div className="flex items-center justify-center gap-1 mb-8">
            {[1, 2, 3, 4, 5].map((s) => (
              <span key={s} className="text-primary-foreground text-2xl">★</span>
            ))}
            <span className="text-primary-foreground/80 ml-2 text-sm">4.9 • 25,000+ reviews</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button className="bg-primary-foreground text-primary font-bold px-8 py-6 rounded-xl hover:bg-primary-foreground/90 flex items-center gap-2">
              <Apple className="w-5 h-5" />
              App Store
            </Button>
            <Button className="bg-primary-foreground text-primary font-bold px-8 py-6 rounded-xl hover:bg-primary-foreground/90 flex items-center gap-2">
              <Play className="w-5 h-5" />
              Google Play
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
