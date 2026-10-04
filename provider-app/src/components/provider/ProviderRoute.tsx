import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProvider } from '@/contexts/ProviderContext';
import { Loader2 } from 'lucide-react';

/** Routes that are accessible even without KYC approval */
const KYC_ALLOWED_PATHS = [
  '/provider-panel/onboarding',
  '/provider-panel/notifications',
  '/provider-panel/profile',
  '/provider-panel/settings',
];

const ProviderRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const { provider, loading: providerLoading } = useProvider();
  const location = useLocation();

  // Wait for auth to finish first
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Auth done, not logged in
  if (!user) return <Navigate to="/provider-login" replace />;

  // Auth done, user exists, but provider still loading
  if (providerLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Both done, no provider profile found
  if (!provider) return <Navigate to="/provider-login" replace />;

  // Suspended providers: force sign-out (handled in login page too, but extra safety)
  if (provider.status === 'suspended') {
    return <Navigate to="/provider-login" replace />;
  }

  // KYC not submitted or rejected: redirect to onboarding wizard
  // unless they're already there or on an always-allowed page
  const isAllowed = KYC_ALLOWED_PATHS.some(p => location.pathname.startsWith(p));
  if (
    (provider.kyc_status === 'not_submitted' || provider.kyc_status === 'rejected') &&
    !isAllowed
  ) {
    return <Navigate to="/provider-panel/onboarding" replace />;
  }

  return <>{children}</>;
};

export default ProviderRoute;