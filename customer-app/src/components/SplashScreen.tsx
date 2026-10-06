import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LogoMark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import { EASE } from "@/lib/motion";

const SEEN_KEY = "hf_splash_seen";

/**
 * Brand moment on a cold start only. It never delays the app: the app renders underneath,
 * and the splash lifts as soon as the first frame is ready (0.7s max). Returning within the
 * same session — or opening any deep link again — skips it entirely.
 * Ink background and gold mark match the launcher icon, so the hand-off from the native
 * splash (added with the Android build) is seamless.
 */
const SplashScreen = () => {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) !== "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!visible) return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — fine */
    }
    const timer = setTimeout(() => setVisible(false), 700);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          aria-hidden="true"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="pointer-events-none fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-primary"
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <LogoMark className="h-28 w-28 text-gold" />
          </motion.div>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.3 }}
            className="mt-5 text-xl font-extrabold tracking-tight text-primary-foreground"
          >
            {BRAND.name}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
