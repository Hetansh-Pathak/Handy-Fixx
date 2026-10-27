import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Briefcase, TrendingUp, Users } from "lucide-react";
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

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="text-center">
              <Briefcase className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">Flexible</p>
              <p className="text-xs text-muted-foreground">Work Hours</p>
            </div>
            <div className="text-center">
              <TrendingUp className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">₹18,000+</p>
              <p className="text-xs text-muted-foreground">Monthly Avg.</p>
            </div>
            <div className="text-center">
              <Users className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">2,000+</p>
              <p className="text-xs text-muted-foreground">Active Pros</p>
            </div>
          </div>

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
