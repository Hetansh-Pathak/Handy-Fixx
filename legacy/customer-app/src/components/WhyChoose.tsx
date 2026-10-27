import { motion } from "framer-motion";
import { ShieldCheck, MapPin, Clock, Headphones, CreditCard, RotateCcw } from "lucide-react";

const features = [
  { icon: ShieldCheck, title: "Verified & Vetted", desc: "Every pro is background-checked and insured." },
  { icon: MapPin, title: "Live GPS Tracking", desc: "Track your pro in real-time on the way to your home." },
  { icon: Clock, title: "Upfront Pricing", desc: "No hidden fees. Know the price before booking." },
  { icon: Headphones, title: "24/7 Support", desc: "Our support team is always available." },
  { icon: CreditCard, title: "Secure Payments", desc: "Pay securely in-app after the job is done." },
  { icon: RotateCcw, title: "Money-Back Guarantee", desc: "Not satisfied? Get a full refund." },
];

const WhyChoose = () => {
  return (
    <section className="py-20">
      <div className="container mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3">
            Why 25,000+ customers choose HandyFix
          </h2>
          <p className="text-muted-foreground text-lg mb-14">
            We go above and beyond for every job
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              whileHover={{ y: -5 }}
              className="bg-card rounded-2xl p-6 text-left border border-border hover:border-primary/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyChoose;
