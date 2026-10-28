import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import expertImg from "@/assets/expert-woman.jpg";

const ExpertSection = () => {
  const navigate = useNavigate();
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
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-6">
            Find home-service help{" "}
            <span className="text-gradient-gold">when you need it.</span>
          </h2>
          <p className="text-muted-foreground mb-8">
            Browse available services, review provider details, and follow your booking from your account.
          </p>
          <Button
            onClick={() => navigate("/services")}
            className="bg-gradient-gold text-primary-foreground font-bold px-8 py-6 rounded-xl shadow-gold hover:opacity-90"
          >
            Browse Services
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default ExpertSection;
