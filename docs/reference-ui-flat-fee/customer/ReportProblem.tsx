import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Flag, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const sb = supabase as any;

const CATEGORIES = [
  { value: "poor_work", label: "Poor work", hint: "48 h window" },
  { value: "overcharged", label: "Overcharged" },
  { value: "no_show", label: "Pro did not come" },
  { value: "damage", label: "Damage" },
  { value: "behaviour", label: "Behaviour" },
  { value: "safety", label: "Safety issue", hint: "Escalated at once" },
] as const;

const OUTCOME: Record<string, string> = {
  dismissed: "Dismissed: the work was found fine.",
  redo: "Redo: the pro returns free of charge within 7 days.",
  partial_refund: "Settled at an adjusted amount.",
  provider_penalty: "Action taken against the pro.",
};

const REASONS: Record<string, string> = {
  window_closed: "The window to report this booking has closed.",
  already_reported: "You already reported this booking.",
  invalid_details: "Describe the problem in 10 to 1000 characters.",
  not_completed: "You can report a problem after the job is completed.",
};

type Dispute = {
  id: string; category: string; status: string; outcome: string | null;
  decision_note: string | null; provider_reply: string | null; appealed_at: string | null;
};

/** "Report a problem" on a completed job: 24 h (48 h for repair quality), one appeal. */
export default function ReportProblem({ bookingId, completedAt }: { bookingId: string; completedAt: string | null }) {
  const { toast } = useToast();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("poor_work");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await sb.from("booking_disputes").select("*").eq("booking_id", bookingId).maybeSingle();
    setDispute((data as Dispute | null) ?? null);
    setLoaded(true);
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  const hoursSince = completedAt ? (Date.now() - new Date(completedAt).getTime()) / 3_600_000 : 0;
  const windowOpen = hoursSince < 48;
  const hoursLeft = Math.max(0, Math.ceil(24 - hoursSince));
  const isAppeal = dispute?.status === "decided";

  const submit = async () => {
    setSending(true);
    const { data, error } = isAppeal
      ? await sb.rpc("appeal_booking_dispute", { p_dispute_id: dispute!.id, p_note: details })
      : await sb.rpc("raise_booking_dispute", { p_booking_id: bookingId, p_category: category, p_details: details });
    setSending(false);
    if (error || !data?.ok) {
      toast({ title: "Not sent", description: REASONS[data?.reason] ?? error?.message ?? "Please add a little more detail.", variant: "destructive" });
      return;
    }
    toast({ title: isAppeal ? "Appeal sent" : "Problem reported", description: "An admin will decide within 48 hours." });
    setOpen(false);
    setDetails("");
    void load();
  };

  const dialog = (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle>{isAppeal ? "Appeal the decision" : "Report a problem"}</DialogTitle>
            <DialogDescription>
              {isAppeal
                ? "A second admin reviews it. You can appeal once."
                : "The pro replies within 24 hours. HandyFix adds the job timeline (price, trip, arrival, code, extras) and an admin decides within 48 hours."}
            </DialogDescription>
          </DialogHeader>
          {!isAppeal && (
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => {
                const disabled = hoursSince >= 24 && c.value !== "poor_work" && c.value !== "safety";
                return (
                  <button key={c.value} type="button" disabled={disabled} onClick={() => setCategory(c.value)}
                    className={cn("rounded-xl border px-3 py-2 text-left text-sm transition disabled:opacity-40",
                      category === c.value ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>
                    {c.label}
                    {"hint" in c && c.hint && <span className="block text-[10px] text-muted-foreground">{c.hint}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {category === "safety" && !isAppeal && (
            <p className="flex items-start gap-1.5 rounded-xl bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Safety reports skip the queue: the pro is suspended right away while we review.
            </p>
          )}
          <Textarea rows={4} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder={isAppeal ? "Why should this be reviewed again?" : "What went wrong? Add as much detail as you can."} />
          <Button className="w-full bg-gradient-gold font-bold text-primary-foreground" disabled={sending || details.trim().length < 10} onClick={submit}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : isAppeal ? "Send appeal" : "Send report"}
          </Button>
        </DialogContent>
      </Dialog>
    );

  if (!loaded) return null;

  if (dispute) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="flex items-center gap-1.5 font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {dispute.status === "open" ? "Problem reported · admin reviewing" : dispute.status === "appealed" ? "Appeal under review" : "Report decided"}
        </p>
        {dispute.provider_reply && <p className="mt-1 text-xs text-muted-foreground">Pro replied: “{dispute.provider_reply}”</p>}
        {dispute.outcome && (
          <p className="mt-1 text-xs">{OUTCOME[dispute.outcome] ?? dispute.outcome}{dispute.decision_note ? ` ${dispute.decision_note}` : ""}</p>
        )}
        {dispute.status === "decided" && !dispute.appealed_at && (
          <Button size="sm" variant="outline" className="mt-3 rounded-xl" onClick={() => setOpen(true)}>Appeal once</Button>
        )}
        {dialog}
      </div>
    );
  }

  if (!windowOpen) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
        <Flag className="h-4 w-4" /> Report a problem
        <span className="font-normal opacity-80">· open for {hoursLeft > 0 ? `${hoursLeft} h` : "repair quality only"}</span>
      </button>
      {dialog}
    </>
  );
}
