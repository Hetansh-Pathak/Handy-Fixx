import React from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, CheckCircle2 } from 'lucide-react';
import { TERMS_VERSION } from '@/lib/constants';

interface TermsAndConditionsProps {
  onClose?: () => void;
}

const TermsAndConditions: React.FC<TermsAndConditionsProps> = () => {
  return (
    <Card className="glass-card p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <Shield className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h2 className="text-xl font-bold text-foreground">HandyFix Service Provider Partner Agreement</h2>
          <p className="text-xs text-muted-foreground">Terms & Conditions ({TERMS_VERSION}) — Effective October 2026</p>
        </div>
      </div>

      <ScrollArea className="h-[400px] pr-4 text-sm text-muted-foreground space-y-4 leading-relaxed">
        <section className="space-y-2">
          <h3 className="font-semibold text-foreground text-base">1. Verification & Identity Authenticity</h3>
          <p>
            By submitting your KYC information to HandyFix, you certify under penalty of account termination that all documents (Aadhaar, PAN, certificates) and personal details provided belong to you and are legally valid.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-foreground text-base">2. Code of Professional Conduct</h3>
          <p>
            Service providers agree to maintain the highest standards of punctuality, professionalism, and honesty. Any harassment, overcharging, property damage, or fraudulent activity will result in immediate suspension and potential legal action.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-foreground text-base">3. Verification & Approval SLA</h3>
          <p>
            HandyFix admin team reviews submitted KYC applications within 1 to 2 business days. Approval is subject to background verification, document legibility, and age verification (18+ years).
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-foreground text-base">4. Data Protection & Privacy</h3>
          <p>
            Your identification documents are stored in secure, encrypted private storage with restricted access. HandyFix does not share your Aadhaar or PAN details with customers or third parties. Only verified summary information (name, experience, rating, photo) is displayed on the platform.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-foreground text-base">5. Platform Fee & Payouts</h3>
          <p>
            HandyFix retains a standard platform fee on completed jobs. Earnings become eligible for payout upon job completion verified by customer OTP. Payout requests are processed within 1 to 2 business days to your registered bank account or UPI ID.
          </p>
        </section>
      </ScrollArea>

      <div className="flex items-center gap-2 pt-3 border-t border-border text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
        <span>By accepting during KYC onboarding, you agree to comply with all terms above.</span>
      </div>
    </Card>
  );
};

export default TermsAndConditions;
