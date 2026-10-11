import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Banknote, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const sb = supabase as any;

type Payment = { status: string; method: "cash" | "qr" | null; total_amount: number; paid_at: string | null };

const REASONS: Record<string, string> = {
  not_cash_payment: "This booking was not paid in cash.",
  window_closed: "The 7-day window to report this payment has passed.",
  already_disputed: "You already reported this payment. Our team is reviewing it.",
  invalid_reason: "Please describe the problem in 10 to 500 characters.",
  unauthorized: "You cannot report this booking.",
};

/** Shows how a completed booking was paid. For cash payments the customer can report a problem. */
export default function PaymentStatusCard({ bookingId }: { bookingId: string }) {
  const { toast } = useToast();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [disputeStatus, setDisputeStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const [p, d] = await Promise.all([
      sb.from("booking_payments").select("status, method, total_amount, paid_at").eq("booking_id", bookingId).maybeSingle(),
      sb.from("payment_disputes").select("status").eq("booking_id", bookingId).order("created_at", { ascending: false }).limit(1),
    ]);
    setPayment((p.data as Payment | null) ?? null);
    setDisputeStatus(((d.data as Array<{ status: string }> | null) ?? [])[0]?.status ?? null);
  }, [bookingId]);

  useEffect(() => {
    void load();
    const channel = sb
      .channel(`customer-pay-${bookingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_payments", filter: `booking_id=eq.${bookingId}` }, () => void load())
      .subscribe();
    return () => { void sb.removeChannel(channel); };
  }, [bookingId, load]);

  const submit = async () => {
    setSending(true);
    const { data, error } = await sb.rpc("raise_payment_dispute", { p_booking_id: bookingId, p_reason: reason });
    setSending(false);
    if (error || !data?.ok) {
      toast({ title: "Could not send report", description: REASONS[data?.reason] ?? error?.message ?? "Please try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Report sent", description: "Our team will review it and contact you." });
    setOpen(false);
    setReason("");
    void load();
  };

  if (!payment || payment.status !== "paid") return null;
  const amount = Number(payment.total_amount).toLocaleString("en-IN");

  return (
    <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-3">
      <div className="flex items-start gap-3">
        {payment.method === "cash"
          ? <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {payment.method === "cash" ? `Paid ₹${amount} by cash` : `Paid ₹${amount} online`}
          </p>
          <p className="text-xs text-muted-foreground">
            {payment.method === "cash"
              ? "Your provider recorded this cash payment. If you did not pay this amount, report it."
              : "Payment received. Thank you!"}
          </p>
        </div>
        {payment.method === "cash" && !disputeStatus && (
          <Button size="sm" variant="outline" className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => setOpen(true)}>
            <Flag className="mr-1 h-3 w-3" /> Report a problem
          </Button>
        )}
      </div>
      {disputeStatus && (
        <p className="mt-2 text-xs text-muted-foreground">
          {disputeStatus === "open" ? "Your report is being reviewed by our team." : `Your report was reviewed: ${disputeStatus}.`}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle>Report a cash payment problem</DialogTitle>
            <DialogDescription>Tell us what is wrong. For example: you paid online, or you did not pay this amount.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={4} placeholder="Describe the problem…" />
          <Button onClick={submit} disabled={sending || reason.trim().length < 10} className="w-full">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send report"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
