import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import earnImg from "@/assets/earn-pro.jpg";

const EarnSection = () => {
  const navigate = useNavigate();
  return (
    <section className="py-20" id="for-pros">
      <div className="container mx-auto grid md:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-6">
            Turn your skills into{" "}
            <span className="text-gradient-gold">daily income</span>
          </h2>

          <Button
            className="bg-gradient-gold text-primary-foreground font-bold px-8 py-6 rounded-xl shadow-gold hover:opacity-90"
            onClick={() => navigate("/become-a-pro")}
          >
            Join as a Pro →
          </Button>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <img src={earnImg} alt="Join as a professional" loading="lazy" width={640} height={512}
            className="w-full h-auto object-cover rounded-2xl" />
        </motion.div>
      </div>
    </section>
  );
};

export default EarnSection;
