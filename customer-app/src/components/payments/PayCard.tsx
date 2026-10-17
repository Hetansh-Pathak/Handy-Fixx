import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatRupees, payErrorMessage, payForBooking } from "@/lib/payments";

type Props = {
  bookingId: string;
  amount: number;
  paymentStatus: string | null;
  /** Re-fetch the booking after a payment attempt. */
  onChanged: () => void;
};

/** Pay-after-service card for a completed booking: black + gold to pay, green once paid. */
export default function PayCard({ bookingId, amount, paymentStatus, onChanged }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [slow, setSlow] = useState(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // After a payment that Razorpay accepted but our server hasn't confirmed yet, re-check every 4s
  // for up to a minute. The webhook normally finishes it within seconds; this covers a missed realtime event.
  useEffect(() => {
    if (!confirming || paymentStatus === "paid") return;
    setSlow(false);
    const poll = window.setInterval(() => onChangedRef.current(), 4000);
    const giveUp = window.setTimeout(() => { window.clearInterval(poll); setSlow(true); }, 60000);
    return () => { window.clearInterval(poll); window.clearTimeout(giveUp); };
  }, [confirming, paymentStatus]);

  if (paymentStatus === "paid") {
    return (
      <div className="rounded-3xl bg-emerald-600 p-6 text-white" role="status">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8" aria-hidden />
          <div>
            <h3 className="text-xl font-extrabold tracking-tight">Paid {formatRupees(amount)}</h3>
            <p className="text-sm opacity-90">Thank you. Your receipt is saved with this booking.</p>
          </div>
        </div>
      </div>
    );
  }
  if (paymentStatus === "refunded") {
    return <p className="rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold">This booking was refunded.</p>;
  }

  const pay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await payForBooking(bookingId);
      if (r.status === "paid") {
        toast({ title: "Payment received", description: "Thank you!" });
        onChanged();
      } else if (r.status === "pending") {
        setConfirming(true);
        toast({ title: "Confirming your payment…", description: "This usually takes a few seconds." });
        onChanged();
      } else if (r.status === "failed") {
        toast({ variant: "destructive", title: "Payment not completed", description: payErrorMessage(r.code) });
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl bg-primary p-6 text-primary-foreground">
      <p className="text-sm opacity-70">Amount due</p>
      <p className="mt-1 text-4xl font-extrabold tracking-tight">{formatRupees(amount)}</p>
      {confirming ? (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold" role="status">
          {slow ? null : <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {slow
            ? "Your payment is taking longer than usual to confirm. You won't be charged twice. Check again in a few minutes."
            : "Confirming your payment, this page will update by itself."}
        </p>
      ) : (
        <Button
          onClick={pay}
          disabled={busy}
          className="mt-5 h-14 w-full rounded-2xl bg-gold text-base font-bold text-gold-foreground hover:bg-gold/90"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          {busy ? "Opening payment…" : `Pay ${formatRupees(amount)}`}
        </Button>
      )}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs opacity-70">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> UPI, cards and netbanking, secured by Razorpay
      </p>
    </div>
  );
}
