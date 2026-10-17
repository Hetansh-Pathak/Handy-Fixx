import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "./BottomNav";
import PageSkeleton from "./PageSkeleton";
import { warmCommonRoutes } from "@/lib/routeModules";

/**
 * Persistent frame for every page: the navbar, tab bar and footer mount ONCE and stay put,
 * only the page content swaps — which is what makes navigation feel instant.
 */
const AppShell = () => {
  const location = useLocation();
  const reduce = useReducedMotion();
  const isHome = location.pathname === "/";
  const fullBleed = /^\/book\//.test(location.pathname);

  useEffect(() => {
    warmCommonRoutes();
  }, []);

  // New page → start at the top (but never fight a #hash link).
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname, location.hash]);

  return (
    <div className="min-h-dvh bg-background">
      <div className={isHome ? "hidden md:block" : ""}>
        <Navbar />
      </div>
      <main className={`pt-[env(safe-area-inset-top)] ${fullBleed ? "" : "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"}`}>
        {/* Enter-only fade: the new page paints immediately, nothing waits on an exit animation. */}
        <motion.div
          key={location.pathname}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </motion.div>
      </main>
      <div className="hidden md:block">
        <Footer />
      </div>
      <BottomNav />
    </div>
  );
};

export default AppShell;
