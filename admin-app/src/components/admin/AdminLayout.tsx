import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut, Menu, X,
} from 'lucide-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import ThemeToggle from '@/components/ThemeToggle';

const AdminLayout: React.FC = () => {
  const { user, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingKyc, setPendingKyc] = useState<number | null>(null);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchPending = async () => {
      const { count, error } = await supabase
        .from('service_providers')
        .select('id', { count: 'exact', head: true })
        .eq('kyc_status', 'pending');
      if (!active) return;
      if (error) {
        console.error('Could not fetch pending KYC count:', error);
        return;
      }
      setPendingKyc(count);
    };
    void fetchPending();
    const interval = window.setInterval(() => { void fetchPending(); }, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setIsNavigationOpen(false);
  }, [location.pathname]);

  const items = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/kyc', label: 'KYC Review', badge: pendingKyc },
    { to: '/providers', label: 'Providers' },
    { to: '/bookings', label: 'Bookings' },
    { to: '/audit', label: 'Audit Log' },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex min-h-16 flex-wrap items-center justify-between gap-x-4">
          <button type="button" onClick={() => navigate('/dashboard')} className="flex shrink-0 items-center gap-2">
            <img src="/logo.png" alt="HandyFix" className="h-10 w-10 rounded-xl object-contain shadow-lg" />
            <span className="text-xl font-bold text-foreground">HandyFix</span>
          </button>

          <nav
            id="admin-navigation"
            aria-label="Admin navigation"
            className={`order-3 -mx-4 w-[calc(100%+2rem)] border-t border-border/70 bg-card px-4 py-2 xl:order-none xl:mx-0 xl:w-auto xl:flex-1 xl:border-t-0 xl:bg-transparent xl:px-0 ${isNavigationOpen ? 'flex' : 'hidden xl:flex'}`}
          >
            <div className="flex w-full min-w-0 flex-col gap-1 xl:w-full xl:flex-row xl:justify-center xl:gap-2">
              {items.map(item => {
                const active = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setIsNavigationOpen(false)}
                    className={cn(
                      'relative inline-flex min-h-10 w-full items-center justify-between gap-1 rounded-lg px-3 text-sm transition-colors xl:w-auto xl:justify-center xl:px-2.5',
                      active
                        ? 'bg-primary/10 font-semibold text-primary xl:bg-transparent'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground xl:hover:bg-transparent'
                    )}
                  >
                    <span>{item.label}</span>
                    {item.badge !== null && item.badge !== undefined && item.badge > 0 && (
                      <span className={cn(
                        'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold',
                        active ? 'bg-primary/20 text-primary' : 'bg-primary text-primary-foreground'
                      )}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-2 shrink-0 xl:ml-0">
            <ThemeToggle />
            <button
              type="button"
              aria-label={isNavigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isNavigationOpen}
              aria-controls="admin-navigation"
              onClick={() => setIsNavigationOpen(open => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
            >
              {isNavigationOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <span className="hidden max-w-[220px] truncate text-sm text-muted-foreground md:block">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex min-w-0 flex-1 flex-col p-4 md:p-6">
        <div className="w-full min-w-0 flex-1">
          <Outlet />
        </div>
        <footer className="mt-auto border-t border-border pt-6 pb-2 text-center text-xs text-muted-foreground">
          © 2026 HandyFix. All rights reserved. Made with <span className="text-primary" aria-label="love">♥</span> in India.
        </footer>
      </main>
    </div>
  );
};

export default AdminLayout;
