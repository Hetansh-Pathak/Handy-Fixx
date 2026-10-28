import { motion } from "framer-motion";
import { ShieldCheck, MapPin, Clock, Headphones, CreditCard, RotateCcw } from "lucide-react";

const features = [
  { icon: ShieldCheck, title: "Provider Details", desc: "Review the information available on each provider profile." },
  { icon: MapPin, title: "Booking Tracking", desc: "Follow booking status and available location updates." },
  { icon: Clock, title: "Schedule a Service", desc: "Choose a service and submit a booking request online." },
  { icon: Headphones, title: "Booking Chat", desc: "Use booking chat when it is available for your service." },
  { icon: CreditCard, title: "Price Details", desc: "Review service and booking prices before you submit." },
  { icon: RotateCcw, title: "Booking Management", desc: "View and manage your bookings from your account." },
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
            Manage home services with HandyFix
          </h2>
          <p className="text-muted-foreground text-lg mb-14">
            Browse available services and manage your bookings in one place.
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
