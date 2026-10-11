import { useCallback, useEffect, useRef, useState } from 'react';
import { Banknote, CheckCircle2, Loader2, QrCode, ArrowLeft, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { callEdge, inr } from '@/lib/wallet';

type Props = {
  open: boolean;
  bookingId: string | null;
  onClose: () => void;
  onPaid?: () => void;
};

type BookingInfo = { id: string; total_amount: number; provider_amount: number; platform_fee: number; customer_name: string | null };
type PaymentRow = { status: string; method: 'cash' | 'qr' | null; qr_image_url: string | null; qr_expires_at: string | null };
type Mode = 'loading' | 'choose' | 'qr' | 'cash' | 'done';

/** Shown right after the OTP: collect the total by QR (online) or cash. */
export default function PaymentStep({ open, bookingId, onClose, onPaid }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('loading');
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrExpires, setQrExpires] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paidMethod, setPaidMethod] = useState<'cash' | 'qr' | null>(null);
  const [now, setNow] = useState(Date.now());
  const donePaid = useRef(false);

  const markPaid = useCallback((method: 'cash' | 'qr' | null) => {
    setPaidMethod(method);
    setMode('done');
    if (!donePaid.current) {
      donePaid.current = true;
      onPaid?.();
    }
  }, [onPaid]);

  const loadPayment = useCallback(async () => {
    if (!bookingId) return null;
    const { data } = await (supabase as any)
      .from('booking_payments')
      .select('status, method, qr_image_url, qr_expires_at')
      .eq('booking_id', bookingId)
      .maybeSingle();
    return (data as PaymentRow | null) ?? null;
  }, [bookingId]);

  // Load booking + current payment state each time the dialog opens
  useEffect(() => {
    if (!open || !bookingId) return;
    donePaid.current = false;
    setMode('loading');
    setQrUrl(null);
    setQrExpires(null);
    (async () => {
      const { data } = await (supabase as any)
        .from('bookings')
        .select('id, total_amount, provider_amount, platform_fee, customer_name')
        .eq('id', bookingId)
        .maybeSingle();
      if (!data) {
        toast({ title: 'Booking not found', variant: 'destructive' });
        onClose();
        return;
      }
      setBooking(data as BookingInfo);
      const pay = await loadPayment();
      if (pay?.status === 'paid') {
        donePaid.current = true; // already paid earlier: do not fire onPaid again
        setPaidMethod(pay.method);
        setMode('done');
      } else {
        setMode('choose');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookingId]);

  // While a QR is on screen: listen + poll for the payment
  useEffect(() => {
    if (!open || mode !== 'qr' || !bookingId) return;
    const check = async () => {
      const pay = await loadPayment();
      if (pay?.status === 'paid') markPaid(pay.method);
    };
    const channel = supabase
      .channel(`pay-${bookingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_payments', filter: `booking_id=eq.${bookingId}` }, () => void check())
      .subscribe();
    const poll = window.setInterval(() => void check(), 3000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [open, mode, bookingId, loadPayment, markPaid]);

  const startQr = async () => {
    if (!bookingId) return;
    setBusy(true);
    try {
      const res = await callEdge<{ qr_image_url: string; expires_at: string }>('create-qr-payment', { booking_id: bookingId });
      setQrUrl(res.qr_image_url);
      setQrExpires(res.expires_at);
      setMode('qr');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not create the QR';
      if (/already paid/i.test(message)) {
        const pay = await loadPayment();
        markPaid(pay?.method ?? null);
      } else {
        toast({ title: 'Could not create the QR', description: message, variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmCash = async () => {
    if (!bookingId) return;
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc('confirm_cash_collected', { p_booking_id: bookingId });
      if (error) throw new Error(error.message);
      if (!data?.ok) {
        throw new Error(data?.reason === 'not_completed' ? 'This job is not completed yet.' : 'Could not record the cash payment.');
      }
      // Close any open QR so the customer cannot pay twice (best effort; the webhook refunds duplicates anyway)
      void callEdge('close-booking-qr', { booking_id: bookingId }).catch(() => undefined);
      markPaid(data.method === 'qr' ? 'qr' : 'cash');
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const total = Number(booking?.total_amount ?? 0);
  const fee = Number(booking?.platform_fee ?? 0);
  const earn = Number(booking?.provider_amount ?? 0);
  const secondsLeft = qrExpires ? Math.max(0, Math.floor((new Date(qrExpires).getTime() - now) / 1000)) : 0;
  const expired = mode === 'qr' && qrExpires !== null && secondsLeft === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {mode === 'done' ? 'Payment recorded' : 'Collect payment'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {mode === 'done' ? 'This job is settled.' : 'The job is completed. Now collect the amount from the customer.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'loading' && (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        )}

        {mode !== 'loading' && mode !== 'done' && booking && (
          <div className="rounded-xl bg-secondary/50 p-4 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Customer pays</p>
            <p className="text-3xl font-extrabold text-primary">{inr(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {inr(earn)} service charge + {inr(fee)} platform fee
            </p>
          </div>
        )}

        {mode === 'choose' && (
          <div className="space-y-3">
            <Button className="w-full h-12 gold-gradient text-primary-foreground font-bold rounded-xl" onClick={startQr} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><QrCode className="h-5 w-5 mr-2" /> Collect via QR (online)</>}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center -mt-1">
              Customer scans and pays. {inr(earn)} is added to your wallet automatically.
            </p>
            <Button variant="outline" className="w-full h-12 rounded-xl border-border" onClick={() => setMode('cash')} disabled={busy}>
              <Banknote className="h-5 w-5 mr-2" /> Customer paid cash
            </Button>
          </div>
        )}

        {mode === 'qr' && (
          <div className="space-y-3">
            <div className="mx-auto flex h-60 w-60 items-center justify-center rounded-2xl bg-white p-2">
              {qrUrl && !expired
                ? <img src={qrUrl} alt="UPI QR code to pay" className="h-full w-full object-contain" />
                : <p className="px-4 text-center text-sm text-black">QR expired</p>}
            </div>
            {expired ? (
              <Button className="w-full rounded-xl" onClick={startQr} disabled={busy}>
                <RefreshCw className="h-4 w-4 mr-2" /> Generate a new QR
              </Button>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Ask the customer to scan with any UPI app. Waiting for payment… ({Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')})
              </p>
            )}
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setMode('choose')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
        )}

        {mode === 'cash' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
              Only confirm if you really received {inr(total)} in cash. You keep the cash; the {inr(fee)} platform fee
              is added to your dues. The customer is notified and can report a problem.
            </div>
            <Button className="w-full h-12 bg-success hover:bg-success/90 text-success-foreground font-bold rounded-xl" onClick={confirmCash} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `I collected ${inr(total)} cash`}
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setMode('choose')} disabled={busy}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
        )}

        {mode === 'done' && (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            {paidMethod === 'qr' ? (
              <p className="text-sm text-foreground">
                Payment received online. <span className="font-bold text-primary">{inr(earn)}</span> was added to your wallet.
              </p>
            ) : (
              <p className="text-sm text-foreground">
                Cash recorded. <span className="font-bold text-warning">{inr(fee)}</span> was added to your dues
                and will be taken from your next online payment.
              </p>
            )}
            <Button className="w-full rounded-xl" onClick={onClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
