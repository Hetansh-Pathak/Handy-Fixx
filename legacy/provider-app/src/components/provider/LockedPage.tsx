import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useProvider } from '@/contexts/ProviderContext';
import { motion } from 'framer-motion';
import { Lock, Clock, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LockedPageProps {
  /** The page name to show in the message, e.g. "Bookings" */
  pageName: string;
}

/**
 * LockedPage — shown in place of Dashboard, Bookings, Earnings, Schedule
 * when the provider's KYC is not yet approved.
 */
const LockedPage: React.FC<LockedPageProps> = ({ pageName }) => {
  const { provider } = useProvider();
  const navigate = useNavigate();

  const kyc = provider?.kyc_status;

  const message =
    kyc === 'pending'
      ? "Your verification is under review. This page will unlock once your application is approved (usually 1–2 working days)."
      : kyc === 'rejected'
      ? `Your application was rejected: ${provider?.kyc_rejection_reason || 'Please review and resubmit your verification.'}. Fix the issues to unlock ${pageName}.`
      : `You need to complete your KYC verification before you can access ${pageName}.`;

  const ctaLabel =
    kyc === 'pending'
      ? 'View Notifications'
      : kyc === 'rejected'
      ? 'Fix & Resubmit KYC'
      : 'Complete KYC Now';

  const ctaPath =
    kyc === 'pending'
      ? '/provider-panel/notifications'
      : '/provider-panel/onboarding';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-secondary/50 border border-border flex items-center justify-center mb-6">
        {kyc === 'pending' ? (
          <Clock className="h-10 w-10 text-blue-400" />
        ) : kyc === 'rejected' ? (
          <AlertCircle className="h-10 w-10 text-destructive" />
        ) : (
          <Lock className="h-10 w-10 text-muted-foreground" />
        )}
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-3">{pageName} Locked</h2>
      <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">{message}</p>

      <Button
        className="gold-gradient text-primary-foreground font-semibold"
        onClick={() => navigate(ctaPath)}
      >
        {ctaLabel}
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </motion.div>
  );
};

export default LockedPage;
