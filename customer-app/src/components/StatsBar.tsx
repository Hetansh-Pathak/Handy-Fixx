import { motion } from "framer-motion";
import { Users, Star, Award, IndianRupee } from "lucide-react";

const stats = [
  { icon: Users,        value: "50,000+", label: "Happy Customers",  delay: 0   },
  { icon: IndianRupee,  value: "₹93+",    label: "Avg. Savings",     delay: 0.1 },
  { icon: Star,         value: "4.9★",    label: "Avg. Rating",      delay: 0.2 },
  { icon: Award,        value: "2,000+",  label: "Verified Pros",    delay: 0.3 },
];

const StatsBar = () => {
  return (
    <section
      style={{
        background: "linear-gradient(135deg, #1a1008 0%, #2c1a0a 50%, #1a1008 100%)",
        borderTop: "2px solid hsl(22 61% 47% / 0.4)",
        borderBottom: "2px solid hsl(22 61% 47% / 0.4)",
      }}
      className="py-14"
    >
      <div className="container mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: stat.delay }}
            className="flex flex-col items-center text-center group"
          >
            <div
              style={{ background: "hsl(22 61% 47% / 0.15)", border: "1px solid hsl(22 61% 47% / 0.3)" }}
              className="w-12 h-12 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300"
            >
              <stat.icon className="w-5 h-5" style={{ color: "hsl(22 61% 60%)" }} />
            </div>
            <p
              className="text-3xl md:text-4xl font-extrabold mb-1"
              style={{ color: "#ffffff", textShadow: "0 0 20px hsl(22 61% 47% / 0.5)" }}
            >
              {stat.value}
            </p>
            <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.65)" }}>
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default StatsBar;
