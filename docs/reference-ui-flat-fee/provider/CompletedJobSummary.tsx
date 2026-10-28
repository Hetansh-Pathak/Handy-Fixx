import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { inr } from '@/lib/wallet';

type Fee = { fee: number; status: 'charged' | 'waived' | 'refunded'; final_bill: number; service_bill: number };
type Dispute = {
  id: string; category: string; details: string; status: string; outcome: string | null;
  provider_reply: string | null; decision_note: string | null; appealed_at: string | null; created_at: string;
};

const CATEGORY: Record<string, string> = {
  poor_work: 'Poor work', overcharged: 'Overcharged', no_show: 'No-show',
  damage: 'Damage', behaviour: 'Behaviour', safety: 'Safety',
};

/** Final bill, fee record and (if any) the customer's report with a reply box. */
export default function CompletedJobSummary({ bookingId, total }: { bookingId: string; total: number }) {
  const { toast } = useToast();
  const [fee, setFee] = useState<Fee | null>(null);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase as any;
    const [f, d] = await Promise.all([
      sb.from('booking_fees').select('fee, status, final_bill, service_bill').eq('booking_id', bookingId).maybeSingle(),
      sb.from('booking_disputes').select('*').eq('booking_id', bookingId).maybeSingle(),
    ]);
    setFee(f.data ?? null);
    setDispute(d.data ?? null);
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  const reply = async () => {
    if (!dispute) return;
    setBusy(true);
    const rpc = dispute.status === 'decided' ? 'appeal_booking_dispute' : 'reply_booking_dispute';
    const args = dispute.status === 'decided' ? { p_dispute_id: dispute.id, p_note: text } : { p_dispute_id: dispute.id, p_reply: text };
    const { data, error } = await (supabase as any).rpc(rpc, args);
    setBusy(false);
    if (error || !data?.ok) {
      toast({ title: 'Not sent', description: error?.message ?? 'Write a little more detail and try again.', variant: 'destructive' });
      return;
    }
    toast({ title: dispute.status === 'decided' ? 'Appeal sent' : 'Reply sent', description: 'An admin will review it.' });
    setText('');
    void load();
  };

  const bill = fee?.final_bill ?? total;

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-sm">
        <div className="flex items-center gap-1.5 font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" /> Job closed
        </div>
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Final bill (paid to you directly)</span><span className="font-semibold">{inr(bill)}</span></div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">HandyFix fee from wallet</span>
            <span className="font-semibold">
              {fee ? (fee.status === 'charged' ? `−${inr(fee.fee)}` : `${inr(fee.fee)} ${fee.status === 'waived' ? 'waived' : 'returned'}`) : '—'}
            </span>
          </div>
          <div className="flex justify-between border-t border-success/20 pt-1 font-bold">
            <span>You net</span>
            <span className="text-primary">{inr(bill - (fee?.status === 'charged' ? Number(fee.fee) : 0))}</span>
          </div>
        </div>
        {!dispute && <p className="mt-2 text-[10px] text-muted-foreground">The customer can report a problem for 24 h (48 h for repair quality).</p>}
      </div>

      {dispute && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-warning">
            {dispute.category === 'safety' ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            Customer reported: {CATEGORY[dispute.category] ?? dispute.category}
          </div>
          <p className="mt-1 text-muted-foreground">“{dispute.details}”</p>
          {dispute.provider_reply && <p className="mt-2"><b>Your reply:</b> {dispute.provider_reply}</p>}
          {dispute.outcome && (
            <p className="mt-2"><b>Decision:</b> {dispute.outcome.replace('_', ' ')}{dispute.decision_note ? ` — ${dispute.decision_note}` : ''}</p>
          )}
          {((dispute.status === 'open' && !dispute.provider_reply) || (dispute.status === 'decided' && !dispute.appealed_at)) && (
            <div className="mt-2 space-y-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000}
                placeholder={dispute.status === 'decided' ? 'Why should a second admin review this?' : 'Your side of what happened (reply within 24 h)'} />
              <Button size="sm" className="w-full rounded-xl" disabled={busy || text.trim().length < (dispute.status === 'decided' ? 10 : 5)} onClick={reply}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : dispute.status === 'decided' ? 'Appeal once' : 'Send reply'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
