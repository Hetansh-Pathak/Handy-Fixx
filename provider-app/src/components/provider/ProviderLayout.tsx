import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProvider } from '@/contexts/ProviderContext';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import KycStatusBanner from '@/components/provider/KycStatusBanner';
import ProviderFooter from '@/components/provider/ProviderFooter';
import ThemeToggle from '@/components/ThemeToggle';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Bell, LogOut, Menu, UserRound, X,
} from 'lucide-react';

const KycOnboarding = lazy(() => import('@/pages/provider/KycOnboarding'));

const ProviderLayout: React.FC = () => {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [isKycDialogOpen, setIsKycDialogOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { provider, toggleOnline, unreadNotificationsCount, pendingBookingsCount } = useProvider();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const [isUpdatingOnlineStatus, setIsUpdatingOnlineStatus] = useState(false);
  const isApproved = provider?.kyc_status === 'approved';
  const canGoOnline = isApproved && provider?.status === 'active';

  useEffect(() => {
    setIsNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const routeState = location.state as { openKycOnboarding?: boolean } | null;
    if (!routeState?.openKycOnboarding) return;

    setIsKycDialogOpen(true);
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const navItems = [
    ...(isApproved ? [] : [{ path: '/provider-panel/onboarding', label: 'KYC Verification' }]),
    { path: '/provider-panel', label: 'Dashboard' },
    { path: '/provider-panel/bookings', label: 'Bookings', badge: pendingBookingsCount },
    { path: '/provider-panel/earnings', label: 'Earnings' },
    { path: '/provider-panel/schedule', label: 'Schedule' },
    { path: '/provider-panel/reviews', label: 'Reviews' },
    { path: '/provider-panel/settings', label: 'Settings' },
  ];

  const handleSignOut = async () => {
    if (provider) {
      const { error } = await supabase
        .from('service_providers')
        .update({ is_online: false })
        .eq('id', provider.id);
      if (error) console.error('Could not set provider offline during sign out:', error);
    }
    await signOut();
    navigate('/provider-login');
  };

  const handleOnlineChange = async (isOnline: boolean) => {
    setIsUpdatingOnlineStatus(true);
    try {
      await toggleOnline(isOnline);
      toast({
        title: isOnline ? 'You are online' : 'You are offline',
        description: isOnline
          ? 'You can now receive booking requests.'
          : 'You will not receive new booking requests.',
      });
    } catch (error) {
      console.error('Could not update provider online status:', error);
      toast({
        title: 'Online status not updated',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingOnlineStatus(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex min-h-16 flex-wrap items-center justify-between gap-x-4">
          <button type="button" onClick={() => navigate('/provider-panel')} className="flex shrink-0 items-center gap-2">
            <img src="/logo.png" alt="HandyFix" className="h-10 w-10 rounded-xl object-contain shadow-lg" />
            <span className="text-xl font-bold text-foreground">HandyFix</span>
          </button>

          <nav
            id="provider-navigation"
            aria-label="Provider navigation"
            className={`order-3 -mx-4 w-[calc(100%+2rem)] border-t border-border/70 bg-card px-4 py-2 xl:order-none xl:mx-0 xl:w-auto xl:flex-1 xl:border-t-0 xl:bg-transparent xl:px-0 ${isNavigationOpen ? 'flex' : 'hidden xl:flex'}`}
          >
            <div className="flex w-full min-w-0 flex-col gap-1 xl:w-full xl:flex-row xl:justify-center xl:gap-2">
              {navItems.map(item => {
                const active = item.path === '/provider-panel'
                  ? location.pathname === item.path
                  : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
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
                    {!!item.badge && item.badge > 0 && (
                      <span className={cn(
                        'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold',
                        active ? 'bg-primary/20 text-primary' : 'bg-primary text-primary-foreground'
                      )}>
                        {item.badge > 9 ? '9+' : item.badge}
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
              onClick={() => navigate('/provider-panel/notifications')}
              aria-label={unreadNotificationsCount > 0
                ? `Notifications, ${unreadNotificationsCount} unread`
                : 'Notifications'}
              aria-current={location.pathname.startsWith('/provider-panel/notifications') ? 'page' : undefined}
              className={cn(
                'relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                location.pathname.startsWith('/provider-panel/notifications') && 'border-primary/40 text-primary'
              )}
            >
              <Bell className="h-5 w-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/provider-panel/profile')}
              aria-label="Profile"
              aria-current={location.pathname.startsWith('/provider-panel/profile') ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                location.pathname.startsWith('/provider-panel/profile') && 'border-primary/40 text-primary'
              )}
            >
              <UserRound className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={isNavigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isNavigationOpen}
              aria-controls="provider-navigation"
              onClick={() => setIsNavigationOpen(open => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
            >
              {isNavigationOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {provider && (canGoOnline || provider.is_online) && (
              <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                <span className={cn('h-2.5 w-2.5 rounded-full', provider.is_online ? 'bg-success' : 'bg-muted-foreground')} />
                <span className="text-sm font-medium">{provider.is_online ? 'Online' : 'Offline'}</span>
                <Switch
                  aria-label="Toggle online status"
                  checked={provider.is_online || false}
                  onCheckedChange={handleOnlineChange}
                  disabled={isUpdatingOnlineStatus}
                  className="data-[state=checked]:bg-success"
                />
              </div>
            )}
            {provider && !canGoOnline && !provider.is_online && (
              <span className="hidden max-w-48 text-xs text-muted-foreground sm:block" role="status">
                Account {provider.status.replaceAll('_', ' ')} — contact support to reactivate.
              </span>
            )}
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

        {provider && (canGoOnline || provider.is_online) && (
          <div className="sm:hidden flex items-center justify-between border-t border-border/70 px-4 py-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className={cn('h-2.5 w-2.5 rounded-full', provider.is_online ? 'bg-success' : 'bg-muted-foreground')} />
              {provider.is_online ? 'Online' : 'Offline'}
            </span>
            <Switch
              aria-label="Toggle online status"
              checked={provider.is_online || false}
              onCheckedChange={handleOnlineChange}
              disabled={isUpdatingOnlineStatus}
              className="data-[state=checked]:bg-success"
            />
          </div>
        )}
        {provider && !canGoOnline && !provider.is_online && (
          <div className="sm:hidden border-t border-border/70 px-4 py-2 text-center text-xs text-muted-foreground" role="status">
            Account {provider.status.replaceAll('_', ' ')} — contact support to reactivate.
          </div>
        )}

      </header>

      <KycStatusBanner />
      <main className="flex min-w-0 flex-1 flex-col p-4 md:p-6">
        <div className="w-full min-w-0 flex-1">
          <Outlet />
        </div>
        <ProviderFooter />
      </main>
      <Dialog open={isKycDialogOpen} onOpenChange={setIsKycDialogOpen}>
        <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Provider verification</DialogTitle>
            <DialogDescription>
              Complete or update your verification without leaving the Provider panel.
            </DialogDescription>
          </DialogHeader>
          <Suspense fallback={
            <div className="flex min-h-48 items-center justify-center" aria-busy="true">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          }>
            <KycOnboarding onClose={() => setIsKycDialogOpen(false)} />
          </Suspense>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProviderLayout;
