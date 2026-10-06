import { useEffect, useState } from 'react';
import { Flag, AlertCircle, HelpCircle, Loader2, Lock, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ─────────────────────────────────────────────────────────────────────
type RpcFail = {
  ok: false;
  reason: string;       // 'wrong_code' | 'locked' | 'unauthorized' | ...
  attempts_left?: number;
  locked?: boolean;
  locked_until?: string;
};
// Flat shape: works without strictNullChecks, where the ok:true/false union does not narrow.
type RpcResult = { ok: boolean } & Partial<Omit<RpcFail, 'ok'>>;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatLockTime(lockedUntil: string): string {
  const diff = Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60_000));
  return diff <= 1 ? 'less than a minute' : `${diff} minutes`;
}

// ── Props ─────────────────────────────────────────────────────────────────────
type Props = {
  open: boolean;
  bookingId: string;
  onClose: () => void;
  onCompleted: () => void;
};

export default function CompleteJobDialog({ open, bookingId, onClose, onCompleted }: Props) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setCode('');
      setErrorMsg(null);
      setAttemptsLeft(null);
      setLockedUntil(null);
      setShowHelp(false);
      setReportSent(false);
    }
  }, [open]);

  const isLocked = lockedUntil !== null && new Date(lockedUntil) > new Date();

  const handleSubmit = async () => {
    if (code.length !== 4 || submitting || isLocked) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.rpc('complete_booking_with_code', {
        p_booking_id: bookingId,
        p_code: code,
      });

      if (error) {
        console.error('[CompleteJobDialog] RPC error:', error);
        setErrorMsg(error.message);
        setSubmitting(false);
        return;
      }

      const result = data as RpcResult;

      if (result.ok) {
        toast({ title: '🎉 Job Completed!', description: 'Your earnings become withdrawable once the customer has paid.' });
        onCompleted();
        onClose();
      } else if (result.reason === 'wrong_code') {
        setCode('');
        const left = result.attempts_left ?? 0;
        setAttemptsLeft(left);
        if (result.locked && result.locked_until) {
          setLockedUntil(result.locked_until);
          setErrorMsg(`Too many wrong attempts. Try again in ${formatLockTime(result.locked_until)}.`);
        } else {
          setErrorMsg(
            `Incorrect code.${left > 0 ? ` ${left} attempt${left === 1 ? '' : 's'} left.` : ' No attempts left.'}`,
          );
        }
      } else if (result.reason === 'locked') {
        const lu = result.locked_until ?? '';
        setLockedUntil(lu);
        setErrorMsg(`Locked. Try again in ${lu ? formatLockTime(lu) : 'a few minutes'}.`);
      } else if (result.reason === 'invalid_status') {
        setErrorMsg('This booking is not in progress — cannot complete it.');
      } else {
        setErrorMsg('An error occurred. Please try again.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unexpected error';
      console.error('[CompleteJobDialog] unexpected:', e);
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportIssue = async () => {
    if (reportSent) return;
    setReportSent(true);
    // Goes through report_job_issue(): the old code inserted provider_id '__admin__' (not a uuid, no policy), which
    // always failed, and the dialog still said "Issue reported".
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { ok?: boolean; reason?: string } | null; error: { message: string } | null }>;
    }).rpc('report_job_issue', { p_booking_id: bookingId, p_reason: 'customer_unavailable' });

    if (error || data?.ok !== true) {
      setReportSent(false);
      toast({
        title: 'Could not send the report',
        description: error?.message ?? (data?.reason === 'unauthorized' ? 'This booking is not assigned to you.' : 'Please try again, or contact support.'),
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Issue reported',
      description: 'Our team will review this booking and contact you shortly.',
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-sm" aria-label="Complete job dialog">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Flag className="w-5 h-5 text-success" />
            Mark Job as Completed
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Ask the customer for their 4-digit completion code to confirm the work is done.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* OTP Input */}
          <div className="flex justify-center">
            <InputOTP
              maxLength={4}
              value={code}
              onChange={(val) => {
                setCode(val);
                setErrorMsg(null);
              }}
              disabled={submitting || isLocked}
              aria-label="4-digit completion code"
            >
              <InputOTPGroup>
                {[0, 1, 2, 3].map(i => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="w-14 h-14 text-2xl font-bold text-foreground border-border data-[active=true]:border-primary"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          {/* Error / lock message */}
          {errorMsg && (
            <div className={`flex items-start gap-2 p-3 rounded-xl ${isLocked ? 'bg-warning/10 border border-warning/20' : 'bg-destructive/10 border border-destructive/20'}`}>
              {isLocked
                ? <Lock className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                : <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              }
              <p className={`text-sm ${isLocked ? 'text-warning' : 'text-destructive'}`}>{errorMsg}</p>
            </div>
          )}

          {/* Attempts indicator */}
          {attemptsLeft !== null && !isLocked && (
            <div className="flex justify-center gap-1.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i < attemptsLeft ? 'bg-warning' : 'bg-muted'}`}
                />
              ))}
            </div>
          )}

          {/* Submit button */}
          <Button
            className="w-full bg-success hover:bg-success/90 text-success-foreground font-bold rounded-xl h-11"
            onClick={handleSubmit}
            disabled={code.length !== 4 || submitting || isLocked}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</>
            ) : (
              <><Flag className="w-4 h-4 mr-2" /> Complete Job</>
            )}
          </Button>

          {/* Help / report */}
          <div className="border-t border-border pt-3">
            {!showHelp ? (
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5 py-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Customer unavailable or can't share code?
              </button>
            ) : (
              <div className="space-y-2 text-xs text-muted-foreground text-center">
                <p>If the customer is unreachable, you can report this issue.</p>
                <p className="text-warning">⚠️ This will NOT complete the job — our team will review.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-warning/30 text-warning hover:bg-warning/10 rounded-xl"
                  onClick={handleReportIssue}
                  disabled={reportSent}
                >
                  <Send className="w-3 h-3 mr-1.5" />
                  {reportSent ? 'Reported ✓' : 'Report Issue & Exit'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
