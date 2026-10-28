import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const CTASection = () => {
  const navigate = useNavigate();
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
            Book a home service.
            <br />
            Track your booking.
          </h2>
          <div className="flex justify-center">
            <Button
              onClick={() => navigate("/services")}
              className="bg-primary-foreground text-primary font-bold px-8 py-6 rounded-xl hover:bg-primary-foreground/90"
            >
              Browse Services
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
