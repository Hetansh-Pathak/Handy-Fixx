import { useCallback, useEffect, useState } from "react";
import { Image as ImageIcon, Loader2, Lock, Package, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { inr } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const sb = supabase as any;

type Extra = {
  id: string;
  title: string;
  kind: "labour" | "parts";
  amount: number;
  status: "pending" | "approved" | "declined" | "withdrawn";
  photo_path: string | null;
};

type Props = {
  bookingId: string;
  status: string;
  total: number;
  lockedPrice: number | null;
  providerName: string;
};

/**
 * One price, locked at booking. The bill only grows when the customer taps Approve
 * on an extra-work item the pro added.
 */
export default function BillCard({ bookingId, status, total, lockedPrice, providerName }: Props) {
  const { toast } = useToast();
  const [extras, setExtras] = useState<Extra[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await sb
      .from("booking_extras")
      .select("id, title, kind, amount, status, photo_path")
      .eq("booking_id", bookingId)
      .order("created_at");
    setExtras((data ?? []) as Extra[]);
  }, [bookingId]);

  useEffect(() => {
    void load();
    const channel = sb
      .channel(`bill-${bookingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_extras", filter: `booking_id=eq.${bookingId}` }, () => void load())
      .subscribe();
    return () => { void sb.removeChannel(channel); };
  }, [bookingId, load]);

  const decide = async (extra: Extra, approve: boolean) => {
    setBusy(extra.id);
    const { data, error } = await sb.rpc("decide_booking_extra", { p_extra_id: extra.id, p_approve: approve });
    setBusy(null);
    if (error || !data?.ok) {
      toast({ title: "Could not update", description: error?.message ?? "This item was already answered.", variant: "destructive" });
    } else {
      toast({ title: approve ? `Approved: +${inr(extra.amount)}` : "Declined", description: approve ? `New total ${inr(data.total)}.` : "Your price stays the same." });
    }
    void load();
  };

  const openPhoto = async (path: string) => {
    const { data, error } = await supabase.storage.from("booking-extras").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: "Photo unavailable", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const approved = extras.filter((e) => e.status === "approved");
  const pending = extras.filter((e) => e.status === "pending");
  const base = lockedPrice ?? total - approved.reduce((s, e) => s + Number(e.amount), 0);
  const canDecide = ["on_the_way", "in_progress"].includes(status);

  return (
    <div className="space-y-3">
      {canDecide && pending.map((e) => (
        <div key={e.id} className="rounded-2xl border border-amber-400/40 bg-amber-50 p-4 text-zinc-900 dark:bg-amber-400/10 dark:text-foreground">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Extra work request</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="flex items-center gap-1.5 font-semibold">
              {e.kind === "parts" ? <Package className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
              {e.title}
            </div>
            <span className="shrink-0 font-bold">+ {inr(e.amount)}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-muted-foreground">
            {e.photo_path ? "Bill photo attached. " : ""}Price stays {inr(total)} unless you approve.
          </p>
          {e.photo_path && (
            <button type="button" onClick={() => openPhoto(e.photo_path!)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400">
              <ImageIcon className="h-3.5 w-3.5" /> View bill photo
            </button>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" className="rounded-xl border-zinc-300 bg-white dark:bg-transparent" disabled={busy === e.id} onClick={() => decide(e, false)}>
              Decline
            </Button>
            <Button className="rounded-xl bg-amber-400 font-bold text-zinc-900 hover:bg-amber-300" disabled={busy === e.id} onClick={() => decide(e, true)}>
              {busy === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
            </Button>
          </div>
          <p className="mt-2 text-right text-xs text-zinc-600 dark:text-muted-foreground">If approved, total becomes <b>{inr(total + Number(e.amount))}</b></p>
        </div>
      ))}

      <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Service price</span><span className="font-medium">{inr(base)}</span></div>
        {approved.map((e) => (
          <div key={e.id} className="flex justify-between">
            <span className="text-muted-foreground">{e.title}</span><span className="font-medium">+ {inr(e.amount)}</span>
          </div>
        ))}
        {extras.filter((e) => e.status === "declined").map((e) => (
          <div key={e.id} className="flex justify-between text-muted-foreground line-through">
            <span>{e.title}</span><span>{inr(e.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between"><span className="text-muted-foreground">Platform fee</span><span className="font-medium text-green-600 dark:text-green-400">₹0</span></div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
          <span>{status === "completed" ? `Pay ${providerName}` : "Total"}</span>
          <span className="text-primary">{inr(total)}</span>
        </div>
        <p className={cn("mt-2 flex items-center gap-1.5 text-xs text-muted-foreground")}>
          <Lock className="h-3 w-3" /> Price locked at booking. Pay {providerName} directly by UPI or cash after the service.
        </p>
      </div>
    </div>
  );
}
