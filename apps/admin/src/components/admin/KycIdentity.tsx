import React, { useEffect, useRef, useState } from 'react';
import { bankNameMatch, maskPanLast4, type NameMatch } from '@handyfix/shared';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

/** How long a revealed PAN stays on screen. */
const SHOW_SECONDS = 30;

const MATCH_TEXT: Record<NameMatch, { label: string; tone: string }> = {
  match: { label: 'Names match', tone: 'text-emerald-500' },
  partial: { label: 'Partly matches: check by hand', tone: 'text-amber-500' },
  mismatch: { label: 'Names do not match', tone: 'text-red-500' },
  unknown: { label: 'No payout name saved yet', tone: 'text-muted-foreground' },
};

type Props = {
  providerId: string;
  /** Last 4 characters of the saved PAN (the only part the database lets the admin app read). */
  panLast4: string | null;
  /** The name from the application, and the name on the pro's bank account (shown as a hint). */
  kycName: string | null;
  bankAccountName: string | null;
  upiId: string | null;
};

/**
 * The PAN as XXXXXX + last 4 characters, a logged "Show full PAN" button (kyc-admin-reveal-pan: asks why, writes the
 * view to kyc_access_log before answering, hides the number again after a few seconds) and the bank-name hint.
 */
export function KycIdentity({ providerId, panLast4, kycName, bankAccountName, upiId }: Props) {
  const { toast } = useToast();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [pan, setPan] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => { setPan(null); clearInterval(timer.current); }, [providerId]);

  const hide = () => { clearInterval(timer.current); setPan(null); setLeft(0); };

  const reveal = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('kyc-admin-reveal-pan', { body: { provider_id: providerId, reason: reason.trim() } });
      if (error) {
        const ctx = (error as { context?: unknown }).context;
        const detail = ctx instanceof Response ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
        throw new Error(detail?.error ?? 'Could not show the PAN.');
      }
      const value = (data as { pan?: string } | null)?.pan;
      if (!value) throw new Error('Could not show the PAN.');
      setPan(value);
      setAsking(false);
      setReason('');
      setLeft(SHOW_SECONDS);
      clearInterval(timer.current);
      timer.current = setInterval(() => {
        setLeft((n) => {
          if (n <= 1) { clearInterval(timer.current); setPan(null); return 0; }
          return n - 1;
        });
      }, 1000);
    } catch (e) {
      toast({ title: 'PAN not shown', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const payoutName = bankAccountName?.trim() || null;
  const match = bankNameMatch(kycName, payoutName);

  return (
    <div className="grid grid-cols-2 gap-4 bg-secondary/30 p-3 rounded-xl text-xs">
      <div>
        <span className="text-muted-foreground">PAN Number:</span>
        <p className="font-mono font-bold break-all" data-testid="pan-value">{pan ?? maskPanLast4(panLast4)}</p>
        {panLast4 ? (
          pan ? (
            <button type="button" onClick={hide} className="mt-1 inline-flex items-center gap-1 text-primary underline">
              <EyeOff className="h-3 w-3" /> Hide ({left}s)
            </button>
          ) : (
            <button type="button" onClick={() => setAsking(true)} className="mt-1 inline-flex items-center gap-1 text-primary underline">
              <Eye className="h-3 w-3" /> Show full PAN (logged)
            </button>
          )
        ) : null}
      </div>
      <div>
        <span className="text-muted-foreground">Payout account name:</span>
        <p className="font-bold">{payoutName ?? (upiId ? `UPI ${upiId}` : 'N/A')}</p>
        <p className={`mt-1 font-semibold ${MATCH_TEXT[match].tone}`} data-testid="name-match">{MATCH_TEXT[match].label}</p>
      </div>

      <Dialog open={asking} onOpenChange={(o) => { if (!busy) setAsking(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Show the full PAN</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Every view is recorded with your name, the time and the reason below. Only do this when you need the full number.
          </p>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why do you need it? e.g. support ticket 123" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void reveal()} disabled={busy || reason.trim().length < 3}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Show PAN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
