import { Bell, CalendarDays, Home, LayoutGrid, User } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { prefetchRoute } from "@/lib/routeModules";
import { EASE, haptic } from "@/lib/motion";

type Tab = {
  label: string;
  href: string;
  Icon: typeof Home;
  requiresAuth?: boolean;
  badge?: "bookings" | "notifications";
  match: (p: string) => boolean;
};

const tabs: Tab[] = [
  { label: "Home", href: "/", Icon: Home, match: (p) => p === "/" },
  { label: "Services", href: "/services", Icon: LayoutGrid, match: (p) => p.startsWith("/services") || p.startsWith("/provider/") || p.startsWith("/book/") },
  { label: "Bookings", href: "/my-bookings", Icon: CalendarDays, requiresAuth: true, badge: "bookings", match: (p) => p.startsWith("/my-bookings") || p.startsWith("/booking-confirmation") },
  { label: "Alerts", href: "/notifications", Icon: Bell, requiresAuth: true, badge: "notifications", match: (p) => p.startsWith("/notifications") },
  { label: "Profile", href: "/profile", Icon: User, requiresAuth: true, match: (p) => p.startsWith("/profile") },
];

const HIDDEN_ON = [/^\/auth/, /^\/forgot-password/, /^\/reset-password/, /^\/book\//];

const BottomNav = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pincode, upcomingBookingsCount, unreadNotificationsCount } = useApp();

  if (HIDDEN_ON.some((re) => re.test(pathname))) return null;

  const go = (tab: Tab) => {
    haptic();
    if (tab.requiresAuth && !user) {
      navigate(`/auth?redirect=${encodeURIComponent(tab.href)}`);
      return;
    }
    if (pathname === tab.href) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    navigate(tab.href === "/services" && pincode ? `/services?pincode=${pincode}` : tab.href);
  };

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border/70 bg-background/90 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5 px-1">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const count =
            tab.badge === "bookings" ? upcomingBookingsCount : tab.badge === "notifications" ? unreadNotificationsCount : 0;
          return (
            <li key={tab.href}>
              <button
                type="button"
                onClick={() => go(tab)}
                onTouchStart={() => prefetchRoute(tab.href)}
                onPointerEnter={() => prefetchRoute(tab.href)}
                aria-current={active ? "page" : undefined}
                className={`press relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-tight transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground/80"
                }`}
              >
                <span className="relative">
                  <tab.Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                  {count > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold text-gold-foreground">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </span>
                {tab.label}
                {active && (
                  <motion.span
                    layoutId="tab-dot"
                    transition={{ duration: 0.3, ease: EASE }}
                    className="absolute top-1.5 h-1 w-1 rounded-full bg-gold"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default BottomNav;
