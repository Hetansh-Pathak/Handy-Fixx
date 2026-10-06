import { motion } from "framer-motion";
import { Check, MapPin, Navigation, Wrench, X } from "lucide-react";
import { EASE } from "@/lib/motion";

type Props = {
  status: string;
  onTheWay: boolean;
  arrived?: boolean;
  etaMinutes?: number | null;
  providerName?: string | null;
  bookingCode: string;
};

/** One full-width hero that morphs with the booking status: gold = waiting, green = good news, black = live work, red = problem. */
const StatusHero = ({ status, onTheWay, arrived, etaMinutes, providerName, bookingCode }: Props) => {
  const key = status === "on_the_way" && arrived ? "arrived" : status === "confirmed" && onTheWay ? "on_the_way" : status;
  const first = providerName?.split(" ")[0] ?? "Your pro";

  const cfg = {
    pending:    { bg: "bg-gold text-gold-foreground", title: "Finding your pro", sub: "Sent to the pro. Usually a quick reply." },
    confirmed:  { bg: "bg-emerald-600 text-white", title: `${first} accepted`, sub: "Your booking is confirmed." },
    on_the_way: { bg: "bg-primary text-primary-foreground", title: `${first} is on the way`, sub: etaMinutes ? `Arriving in about ${etaMinutes} min` : "Heading to your address" },
    arrived:    { bg: "bg-emerald-600 text-white", title: `${first} has arrived`, sub: "Share your code only after the work is done." },
    in_progress:{ bg: "bg-primary text-primary-foreground", title: "Work in progress", sub: `${first} has started the job.` },
    completed:  { bg: "bg-emerald-600 text-white", title: "All done", sub: "Hope the job went well." },
    cancelled:  { bg: "bg-destructive text-destructive-foreground", title: "Not confirmed", sub: "The pro couldn't take this one." },
  }[key] ?? { bg: "bg-gold text-gold-foreground", title: "Finding your pro", sub: "" };

  const Icon = key === "on_the_way" ? Navigation : key === "arrived" ? MapPin : key === "in_progress" ? Wrench : key === "cancelled" ? X : Check;

  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className={`relative overflow-hidden rounded-[28px] px-6 py-10 text-center ${cfg.bg}`}
    >
      <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
        {key === "pending" && [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border-2 border-current"
            initial={{ scale: 0.6, opacity: 0.6 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: i }}
          />
        ))}
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-black/15"
        >
          {key === "pending" ? (
            <span className="h-3 w-3 animate-pulse rounded-full bg-current" />
          ) : (
            <Icon className="h-9 w-9" strokeWidth={2.6} />
          )}
        </motion.span>
      </div>
      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4, ease: EASE }} className="mt-5 text-[28px] font-extrabold tracking-tight">
        {cfg.title}
      </motion.h1>
      <p className="mt-1 text-[15px] opacity-80">{cfg.sub}</p>
      <span className="mt-4 inline-block rounded-full bg-black/15 px-3 py-1 font-mono text-xs">{bookingCode}</span>
    </motion.div>
  );
};

export default StatusHero;
