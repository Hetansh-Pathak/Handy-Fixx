import React, { useState } from 'react';
import logo from '@/assets/logo.png';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useProvider } from '@/contexts/ProviderContext';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import KycStatusBanner from '@/components/provider/KycStatusBanner';
import RequestAlert from '@/components/provider/RequestAlert';
import ActiveJob from '@/components/provider/ActiveJob';
import {
  LayoutDashboard, Briefcase, DollarSign, CalendarDays,
  Star, Bell, User, Settings, LogOut, Menu, X, ChevronLeft,
  ClipboardList
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const ProviderLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { provider, toggleOnline, unreadNotificationsCount, pendingBookingsCount } = useProvider();
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isApproved = provider?.kyc_status === 'approved';

  const navItems = [
    ...(isApproved ? [] : [{ path: '/provider-panel/onboarding', label: 'KYC Verification', icon: ClipboardList }]),
    { path: '/provider-panel', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/provider-panel/bookings', label: 'Bookings', icon: Briefcase, badge: pendingBookingsCount },
    { path: '/provider-panel/earnings', label: 'Earnings', icon: DollarSign },
    { path: '/provider-panel/schedule', label: 'Schedule', icon: CalendarDays },
    { path: '/provider-panel/reviews', label: 'Reviews', icon: Star },
    { path: '/provider-panel/notifications', label: 'Notifications', icon: Bell, badge: unreadNotificationsCount },
    { path: '/provider-panel/profile', label: 'Profile', icon: User },
    { path: '/provider-panel/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleNav = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleSignOut = async () => {
    if (provider) {
      await supabase
        .from('service_providers')
        .update({ is_online: false })
        .eq('id', provider.id);
    }
    await signOut();
    navigate('/provider-login');
  };

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center gap-3">
        <img
          src={logo}
          alt="HandyFix"
          className="w-10 h-10 rounded-xl object-cover shadow-md shrink-0"
          style={{ boxShadow: '0 0 12px 2px hsl(22 61% 47% / 0.35)' }}
        />
        {!collapsed && <span className="font-bold text-lg gold-text">HandyFix Provider</span>}
      </div>

      {!collapsed && provider && (
        <div className="px-4 pb-4">
          <div className="glass-card p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", provider.is_online ? "bg-success animate-pulse-gold" : "bg-muted-foreground")} />
              <span className="text-sm text-muted-foreground">{provider.is_online ? 'Online' : 'Offline'}</span>
            </div>
            {isApproved ? (
              <Switch
                checked={provider.is_online || false}
                onCheckedChange={toggleOnline}
                className="data-[state=checked]:bg-success"
              />
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Switch disabled checked={false} className="opacity-40 cursor-not-allowed" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Complete KYC verification to go online
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      )}

      <nav className="flex-1 px-2 space-y-1 overflow-y-auto scrollbar-hide">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => handleNav(item.path)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all relative",
              isActive(item.path)
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && (
              <span className="flex-1 text-left">{item.label}</span>
            )}
            {item.badge && item.badge > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="p-2 mt-auto">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col border-r border-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}>
        <NavContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 mx-2 mb-2 rounded-lg hover:bg-secondary/50 text-muted-foreground"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-border z-50 lg:hidden"
            >
              <NavContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-4 bg-background/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-secondary/50">
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="font-semibold text-lg hidden sm:block">
              {navItems.find(n => isActive(n.path))?.label || 'Dashboard'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {isApproved && (
              <button
                onClick={toggleOnline}
                className={cn('press flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold lg:hidden',
                  provider?.is_online ? 'bg-gold text-gold-foreground' : 'bg-secondary')}
              >
                <span className={cn('h-2 w-2 rounded-full', provider?.is_online ? 'bg-gold-foreground animate-pulse' : 'bg-muted-foreground')} />
                {provider?.is_online ? 'Online' : 'Offline'}
              </button>
            )}
            <button
              onClick={() => navigate('/provider-panel/notifications')}
              className="relative p-2 rounded-lg hover:bg-secondary/50"
            >
              <Bell className="h-5 w-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            <div
              onClick={() => navigate('/provider-panel/profile')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                {provider?.full_name?.[0]?.toUpperCase() || 'P'}
              </div>
              <span className="text-sm font-medium hidden md:block">{provider?.full_name}</span>
            </div>
          </div>
        </header>

        {/* KYC Status Banner */}
        <KycStatusBanner />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 pb-28 md:p-6 lg:pb-6">
          <Outlet />
        </main>
      </div>
      <RequestAlert />
      <ActiveJob />

      {/* Mobile tab bar */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl lg:hidden">
        <ul className="grid grid-cols-5 px-1">
          {[
            { path: '/provider-panel', label: 'Home', icon: LayoutDashboard },
            { path: '/provider-panel/bookings', label: 'Jobs', icon: Briefcase, badge: pendingBookingsCount },
            { path: '/provider-panel/earnings', label: 'Earnings', icon: DollarSign },
            { path: '/provider-panel/notifications', label: 'Alerts', icon: Bell, badge: unreadNotificationsCount },
            { path: '/provider-panel/profile', label: 'Profile', icon: User },
          ].map((t) => {
            const active = isActive(t.path);
            return (
              <li key={t.path}>
                <button
                  onClick={() => { try { navigator.vibrate?.(8); } catch { /* noop */ } handleNav(t.path); }}
                  aria-current={active ? 'page' : undefined}
                  className={cn('press relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold', active ? 'text-foreground' : 'text-muted-foreground/80')}
                >
                  <span className="relative">
                    <t.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                    {!!t.badge && t.badge > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold text-gold-foreground">{t.badge > 9 ? '9+' : t.badge}</span>
                    )}
                  </span>
                  {t.label}
                  {active && <motion.span layoutId="ptab-dot" transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="absolute top-1.5 h-1 w-1 rounded-full bg-gold" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};

export default ProviderLayout;
