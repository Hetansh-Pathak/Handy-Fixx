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
import logo from "@/assets/logo.png";

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

  const fallbackName = user?.email?.slice(0, 1).toUpperCase() ?? "U";
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "My Account";

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
      <div className="container mx-auto flex items-center justify-between py-3">
        {/* Logo */}
        <button className="flex items-center gap-2" onClick={() => navigate("/")}>
          <img src={logo} alt="HandyFix" className="w-10 h-10 rounded-xl object-cover shadow-lg" />
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
          {user ? (
            <>
              {/* Notification Bell */}
              <button
                className="relative p-2 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors"
                onClick={() => navigate("/notifications")}
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-muted-foreground" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                    {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                  </span>
                )}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors">
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-gradient-gold text-primary-foreground text-xs font-bold">
                        {profile?.full_name?.slice(0, 1).toUpperCase() || fallbackName}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium max-w-[100px] truncate">{displayName}</span>
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
        <button className="md:hidden text-foreground p-1" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
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

              {user && (
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); navigate("/notifications"); }}
                  className="relative text-left py-3 px-3 rounded-lg text-sm transition-colors flex items-center justify-between text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <span className="flex items-center gap-2"><Bell className="w-4 h-4" /> Notifications</span>
                  {unreadNotificationsCount > 0 && (
                    <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                    </span>
                  )}
                </button>
              )}

              <div className="border-t border-border mt-2 pt-3">
                {user ? (
                  <>
                    <p className="text-xs text-muted-foreground px-3 mb-2">{user.email}</p>
                    <Button variant="outline" className="w-full justify-start mb-2" onClick={() => { setIsOpen(false); navigate("/profile"); }}><User className="w-4 h-4 mr-2" />My Profile</Button>
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
