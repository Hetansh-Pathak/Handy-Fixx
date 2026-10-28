import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CalendarDays, LogOut, Menu, User, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import ThemeToggle from "@/components/ThemeToggle";

const navLinks = [
  { label: "Services",     href: "/services"    },
  { label: "My Bookings",  href: "/my-bookings", requiresAuth: true },
  { label: "About Us",     href: "/about"        },
  { label: "Contact",      href: "/contact"      },
  { label: "Become a Pro", href: "/become-a-pro" },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { pincode, upcomingBookingsCount, unreadNotificationsCount, profile } = useApp();

  const fallbackName = user?.email?.slice(0, 1).toUpperCase() ?? "";
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "My Account";
  const isNotificationsActive = location.pathname.startsWith("/notifications");
  const isProfileActive = location.pathname.startsWith("/profile");

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const handleNavClick = (link: typeof navLinks[0]) => {
    setIsOpen(false);
    if (link.requiresAuth && !user) { navigate(`/auth?redirect=${link.href}`); return; }
    if (link.href === "/services") {
      navigate(pincode ? `/services?pincode=${pincode}` : "/services");
    } else {
      navigate(link.href);
    }
  };

  const isActive = (href: string) => location.pathname === href || (href !== "/" && location.pathname.startsWith(href));

  return (
    <motion.nav
      initial={{ y: -100 }} animate={{ y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 backdrop-blur-xl bg-background/80"
    >
      <div className="container mx-auto flex min-h-16 items-center justify-between">
        {/* Logo */}
        <button className="flex items-center gap-2" onClick={() => navigate("/")}>
          <img src="/logo.png" alt="HandyFix" className="h-10 w-10 rounded-xl object-contain shadow-lg" />
          <span className="text-xl font-bold text-foreground">HandyFix</span>
        </button>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <button type="button" key={link.label} onClick={() => handleNavClick(link)}
              className={`relative text-sm transition-colors ${isActive(link.href) ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
              {link.label}
              {link.label === "My Bookings" && upcomingBookingsCount > 0 && (
                <span className="absolute -top-2 -right-3 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {upcomingBookingsCount > 9 ? "9+" : upcomingBookingsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <>
              {/* Notification Bell */}
              <button
                className={`relative p-2 rounded-xl border bg-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isNotificationsActive ? "border-primary/40 text-primary" : "border-border text-muted-foreground"
                }`}
                onClick={() => navigate("/notifications")}
                aria-label={unreadNotificationsCount > 0
                  ? `Notifications, ${unreadNotificationsCount} unread`
                  : "Notifications"}
                aria-current={isNotificationsActive ? "page" : undefined}
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                    {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                  </span>
                )}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Account menu"
                    aria-current={isProfileActive ? "page" : undefined}
                    className={`flex h-10 items-center gap-2 rounded-xl border px-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isProfileActive ? "border-primary/40 text-primary" : "border-border bg-card text-foreground"
                    }`}
                  >
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-gradient-gold text-primary-foreground text-xs font-bold">
                        {profile?.full_name?.slice(0, 1).toUpperCase() || fallbackName}
                      </AvatarFallback>
                    </Avatar>
                    <span className="max-w-[100px] truncate text-sm font-medium">{displayName}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/profile")}><User className="w-4 h-4 mr-2" />My Profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-bookings")}>
                    <CalendarDays className="w-4 h-4 mr-2" />My Bookings
                    {upcomingBookingsCount > 0 && (
                      <span className="ml-auto bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {upcomingBookingsCount}
                      </span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/notifications")}>
                    <Bell className="w-4 h-4 mr-2" />Notifications
                    {unreadNotificationsCount > 0 && (
                      <span className="ml-auto bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                      </span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive"><LogOut className="w-4 h-4 mr-2" />Log Out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => navigate("/auth")}>Log in</Button>
              <Button size="sm" className="bg-gradient-gold text-primary-foreground font-semibold hover:opacity-90" onClick={() => navigate("/auth")}>Book Now</Button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          {user && (
            <>
              <button
                type="button"
                onClick={() => navigate("/notifications")}
                aria-label={unreadNotificationsCount > 0
                  ? `Notifications, ${unreadNotificationsCount} unread`
                  : "Notifications"}
                aria-current={isNotificationsActive ? "page" : undefined}
                className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isNotificationsActive ? "border-primary/40 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                <Bell className="h-5 w-5" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => navigate("/profile")}
                aria-label="Profile"
                aria-current={isProfileActive ? "page" : undefined}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isProfileActive ? "border-primary/40 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                <User className="h-5 w-5" />
              </button>
            </>
          )}
          <button
            type="button"
            aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
            className="text-foreground p-1"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="md:hidden overflow-hidden bg-card border-t border-border">
            <div className="container mx-auto py-4 flex flex-col gap-1">
              {navLinks.map((link) => (
                <button type="button" key={link.label} onClick={() => handleNavClick(link)}
                  className={`relative text-left py-3 px-3 rounded-lg text-sm transition-colors flex items-center justify-between ${isActive(link.href) ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                  {link.label}
                  {link.label === "My Bookings" && upcomingBookingsCount > 0 && (
                    <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {upcomingBookingsCount}
                    </span>
                  )}
                </button>
              ))}

              <div className="border-t border-border mt-2 pt-3">
                {user ? (
                  <>
                    <p className="text-xs text-muted-foreground px-3 mb-2">{user.email}</p>
                    <Button className="w-full bg-gradient-gold text-primary-foreground font-semibold" onClick={handleSignOut}><LogOut className="w-4 h-4 mr-2" />Log Out</Button>
                  </>
                ) : (
                  <Button className="w-full bg-gradient-gold text-primary-foreground font-semibold" onClick={() => { setIsOpen(false); navigate("/auth"); }}>Log in / Sign up</Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Navbar;
