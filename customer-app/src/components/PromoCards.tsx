import { motion } from "framer-motion";
import { Gift, Crown, ShieldCheck } from "lucide-react";

const promos = [
  {
    icon: Gift,
    title: "First Service FREE",
    desc: "Get $50 off your first booking",
    bg: "bg-gradient-gold",
    textColor: "text-primary-foreground",
  },
  {
    icon: Crown,
    title: "HandyFix Plus",
    desc: "Unlimited priority bookings for $9.99/mo",
    bg: "bg-secondary",
    textColor: "text-foreground",
  },
  {
    icon: ShieldCheck,
    title: "100% Verified Pros",
    desc: "Every pro is background-checked & insured",
    bg: "bg-secondary",
    textColor: "text-foreground",
  },
];

const PromoCards = () => {
  return (
    <section className="py-16">
      <div className="container mx-auto grid md:grid-cols-3 gap-5">
        {promos.map((promo, i) => (
          <motion.div
            key={promo.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.15 }}
            whileHover={{ scale: 1.03 }}
            className={`${promo.bg} rounded-2xl p-6 cursor-pointer transition-shadow hover:shadow-gold`}
          >
            <promo.icon className={`w-8 h-8 ${promo.textColor} mb-4`} />
            <h3 className={`text-xl font-bold ${promo.textColor} mb-2`}>{promo.title}</h3>
            <p className={`text-sm ${promo.textColor} opacity-80`}>{promo.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default PromoCards;
