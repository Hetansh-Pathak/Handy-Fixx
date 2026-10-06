import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Shield, Users, BookOpen, FileText,
  LogOut, Menu, X, ChevronLeft, Bell, Wallet
} from 'lucide-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const LOGO_URL = '/logo.png';

interface SidebarItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

const AdminLayout: React.FC = () => {
  const { user, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingKyc, setPendingKyc] = useState(0);

  // Fetch pending KYC count for badge
  useEffect(() => {
    const fetchPending = async () => {
      const { count } = await supabase
        .from('service_providers')
        .select('id', { count: 'exact', head: true })
        .eq('kyc_status', 'pending');
      setPendingKyc(count ?? 0);
    };
    fetchPending();
    const interval = setInterval(fetchPending, 30_000);
    return () => clearInterval(interval);
  }, []);

  const items: SidebarItem[] = [
    { to: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, label: 'Dashboard' },
    { to: '/kyc', icon: <Shield className="h-5 w-5" />, label: 'KYC Review', badge: pendingKyc },
    { to: '/providers', icon: <Users className="h-5 w-5" />, label: 'Providers' },
    { to: '/bookings', icon: <BookOpen className="h-5 w-5" />, label: 'Bookings' },
    { to: '/payouts', icon: <Wallet className="h-5 w-5" />, label: 'Payouts' },
    { to: '/audit', icon: <FileText className="h-5 w-5" />, label: 'Audit Log' },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("flex items-center gap-3 p-4 border-b border-border/50", collapsed && "justify-center")}>
        <img src={LOGO_URL} alt="HandyFix" className="h-8 w-8 rounded-lg object-contain shrink-0" />
        {!collapsed && (
          <div>
            <p className="font-bold text-sm text-foreground">HandyFix</p>
            <p className="text-[10px] text-primary font-semibold tracking-wider uppercase">Admin Panel</p>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto scrollbar-hide">
        {items.map((item) => (
          <TooltipProvider key={item.to} delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer relative',
                      isActive
                        ? 'bg-primary/10 text-primary font-bold border-l-4 border-primary rounded-l-none'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    )
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={cn(
                      "ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-destructive text-destructive-foreground shrink-0 flex items-center justify-center min-w-[20px] h-5",
                      collapsed && "absolute -top-1 -right-1 px-1 py-0 text-[10px] min-w-[16px] h-4"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        ))}
      </nav>

      {/* Collapse toggle (desktop) */}
      <div className="hidden md:flex p-3 border-t border-border/50">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:bg-secondary/50 justify-center transition-all"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>Collapse Sidebar</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className={cn(
        "hidden md:flex flex-col border-r border-border/50 bg-card transition-all duration-300 shrink-0",
        collapsed ? "w-16" : "w-64"
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border/50 z-50 md:hidden"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-card/80 backdrop-blur-xl border-b border-border/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-accent transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-xs font-semibold text-muted-foreground hidden sm:block">
              HandyFix Operations
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[200px]">
              {user?.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 text-xs h-8"
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Logout
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
