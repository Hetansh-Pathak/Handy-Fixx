import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/logo.png";

const SplashScreen = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Show splash for 2.4 seconds then fade out
    const timer = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.55, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
        >
          {/* Pulsing glow ring */}
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute w-52 h-52 rounded-full bg-primary/20 blur-2xl"
          />

          {/* Logo */}
          <motion.img
            src={logo}
            alt="HandyFix"
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.34, 1.56, 0.64, 1] }}
            className="w-28 h-28 rounded-3xl object-cover shadow-gold mb-6 relative z-10"
          />

          {/* Brand name */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
            className="relative z-10 text-center"
          >
            <h1 className="text-3xl font-extrabold tracking-tight text-gradient-gold">
              HandyFix
            </h1>
            <p className="text-muted-foreground text-sm mt-1 tracking-widest uppercase">
              Home Services
            </p>
          </motion.div>

          {/* Loading bar */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "120px" }}
            transition={{ delay: 0.5, duration: 1.6, ease: "easeInOut" }}
            className="absolute bottom-20 h-0.5 rounded-full bg-primary"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
