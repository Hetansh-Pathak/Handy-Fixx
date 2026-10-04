import { motion } from "framer-motion";
import { Search, CheckCircle, SmilePlus } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Find Your Job",
    desc: "Browse services and describe what you need.",
  },
  {
    icon: CheckCircle,
    title: "Get Matched",
    desc: "We'll connect you with a top-rated pro instantly.",
  },
  {
    icon: SmilePlus,
    title: "Job Done",
    desc: "Your expert completes the job to your satisfaction.",
  },
];

const HowItWorks = () => {
  return (
    <section className="py-20 bg-surface-elevated" id="how-it-works">
      <div className="container mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3">
            How HandyFix works
          </h2>
          <p className="text-muted-foreground text-lg mb-14">
            Fix it in three easy steps
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-10">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.2 }}
              className="flex flex-col items-center"
            >
              <motion.div
                whileHover={{ rotate: 10, scale: 1.1 }}
                className="w-20 h-20 rounded-2xl bg-gradient-gold flex items-center justify-center mb-6 shadow-gold"
              >
                <step.icon className="w-9 h-9 text-primary-foreground" />
              </motion.div>
              <h3 className="text-xl font-bold text-foreground mb-2">{step.title}</h3>
              <p className="text-muted-foreground max-w-xs">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
