import { motion } from "framer-motion";
import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import expertImg from "@/assets/expert-woman.jpg";

const benefits = [
  "Background-checked professionals",
  "Trained for complex home repairs",
  "Tools and materials included",
];

const ExpertSection = () => {
  return (
    <section className="py-20 bg-surface-elevated">
      <div className="container mx-auto grid md:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative rounded-2xl overflow-hidden"
        >
          <img
            src={expertImg}
            alt="Expert professional"
            loading="lazy"
            width={640}
            height={512}
            className="w-full h-auto object-cover rounded-2xl"
          />
          <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className="w-4 h-4 fill-primary text-primary" />
              ))}
            </div>
            <span className="text-sm text-foreground font-medium">4.9 • 1,200+ jobs</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-6">
            Expert help at your door in under{" "}
            <span className="text-gradient-gold">60 minutes</span>
          </h2>
          <ul className="space-y-4 mb-8">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-3 text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                {b}
              </li>
            ))}
          </ul>
          <Button className="bg-gradient-gold text-primary-foreground font-bold px-8 py-6 rounded-xl shadow-gold hover:opacity-90">
            Learn More
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default ExpertSection;
