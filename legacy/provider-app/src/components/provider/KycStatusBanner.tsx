import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProvider } from '@/contexts/ProviderContext';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Clock, CheckCircle2, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CONGRATULATIONS_KEY = 'handyfix_kyc_congrats_dismissed';

const KycStatusBanner: React.FC = () => {
  const { provider } = useProvider();
  const navigate = useNavigate();
  const [congratsDismissed, setCongratssDismissed] = useState(() =>
    localStorage.getItem(CONGRATULATIONS_KEY) === 'true'
  );

  useEffect(() => {
    // Reset congratulations dismissal when kyc status changes away from approved
    if (provider?.kyc_status !== 'approved') {
      localStorage.removeItem(CONGRATULATIONS_KEY);
      setCongratssDismissed(false);
    }
  }, [provider?.kyc_status]);

  const location = useLocation();

  if (!provider) return null;
  const { kyc_status, kyc_rejection_reason } = provider;

  // Don't render banner if already on onboarding page
  if (location.pathname.startsWith('/provider-panel/onboarding')) return null;

  // Approved and dismissed → no banner
  if (kyc_status === 'approved' && congratsDismissed) return null;

  const handleDismissCongrats = () => {
    localStorage.setItem(CONGRATULATIONS_KEY, 'true');
    setCongratssDismissed(true);
  };

  const config: Record<string, { bg: string; icon: React.ReactNode; text: string; message: string; action: React.ReactNode }> = {
    not_submitted: {
      bg: 'bg-amber-500/10 border-amber-500/30',
      icon: <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />,
      text: 'text-amber-300',
      message: 'Complete your KYC verification to start receiving bookings.',
      action: (
        <Button
          size="sm"
          className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs h-7 px-3"
          onClick={() => navigate('/provider-panel/onboarding')}
        >
          Complete KYC <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      ),
    },
    pending: {
      bg: 'bg-blue-500/10 border-blue-500/30',
      icon: <Clock className="h-4 w-4 text-blue-400 shrink-0" />,
      text: 'text-blue-300',
      message: 'Your application is under review. This usually takes 1–2 working days.',
      action: null,
    },
    rejected: {
      bg: 'bg-destructive/10 border-destructive/30',
      icon: <AlertCircle className="h-4 w-4 text-destructive shrink-0" />,
      text: 'text-destructive',
      message: kyc_rejection_reason
        ? `Your application was rejected: ${kyc_rejection_reason}`
        : 'Your application needs revision. Please fix the issues and resubmit.',
      action: (
        <Button
          size="sm"
          className="bg-destructive hover:bg-destructive/90 text-white font-semibold text-xs h-7 px-3"
          onClick={() => navigate('/provider-panel/onboarding')}
        >
          Fix & Resubmit <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      ),
    },
    approved: {
      bg: 'bg-success/10 border-success/30',
      icon: <CheckCircle2 className="h-4 w-4 text-success shrink-0" />,
      text: 'text-success',
      message: '🎉 Congratulations! Your account is verified. You can now receive bookings!',
      action: (
        <button
          onClick={handleDismissCongrats}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      ),
    },
  };

  const c = config[kyc_status] || config.not_submitted;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 text-sm border-b',
          c.bg,
        )}
      >
        {c.icon}
        <span className={cn('flex-1 text-xs font-medium', c.text)}>
          {c.message}
        </span>
        {c.action}
      </motion.div>
    </AnimatePresence>
  );
};

export default KycStatusBanner;
