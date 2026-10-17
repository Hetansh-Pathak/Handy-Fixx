import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fieldClass } from "@/components/form/TextField";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/utils";

const sb = supabase as any;
const LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export interface ReviewTarget {
  bookingId: string;
  serviceName: string;
  providerName: string;
  providerId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ReviewTarget | null;
  /** Called after a review is saved (or was already there) so the caller can refresh. */
  onSubmitted: () => void;
}

const ReviewDialog = ({ open, onOpenChange, target, onSubmitted }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(5);
      setComment("");
    }
  }, [open, target?.bookingId]);

  const submit = async () => {
    if (!user || !target || busy) return;
    setBusy(true);

    const { data: profile } = await sb.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();

    let providerId = target.providerId;
    if (!providerId) {
      const { data: booking } = await sb.from("bookings").select("provider_id").eq("id", target.bookingId).maybeSingle();
      providerId = booking?.provider_id ?? null;
    }
    if (!providerId) {
      setBusy(false);
      toast({ title: "Couldn't find the pro for this booking", description: "Open the booking and try again.", variant: "destructive" });
      return;
    }

    // Same fields as the booking page: customer_id is required, user_id satisfies the RLS policy.
    const { error } = await sb.from("reviews").insert({
      booking_id: target.bookingId,
      customer_id: user.id,
      user_id: user.id,
      provider_id: providerId,
      rating,
      comment: comment.trim() || null,
      reviewer_name: profile?.full_name?.trim() || "Customer", // never the email: providers and the public site can see this
    });
    setBusy(false);

    if (error) {
      // reviews.booking_id is unique: a second attempt means it was already reviewed.
      if (error.code === "23505") {
        toast({ title: "Already reviewed", description: "You've already rated this booking." });
        onSubmitted();
        onOpenChange(false);
        return;
      }
      toast({ title: "Couldn't save your review", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Thanks for your review" });
    onSubmitted();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold tracking-tight">Rate your pro</DialogTitle>
          <DialogDescription>
            {target ? `${target.serviceName} with ${target.providerName}` : "How did it go?"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <div>
            <div role="radiogroup" aria-label="Your rating" className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={rating === star}
                  aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                  onClick={() => {
                    setRating(star);
                    haptic();
                  }}
                  className="press flex h-12 w-12 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={cn("h-9 w-9 transition-colors", star <= rating ? "fill-gold text-gold" : "text-muted-foreground/30")}
                  />
                </button>
              ))}
            </div>
            <p className="mt-1 text-center text-sm font-semibold text-muted-foreground" aria-live="polite">
              {LABELS[rating]}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="review-comment" className="text-sm font-semibold">
              Add a comment <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="review-comment"
              rows={3}
              maxLength={500}
              placeholder="What went well? What could be better?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={cn(fieldClass, "h-auto min-h-[96px] resize-none py-3")}
            />
          </div>

          <Button size="lg" className="w-full" onClick={() => void submit()} disabled={busy} aria-busy={busy}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" /> Saving…
              </>
            ) : (
              "Submit review"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReviewDialog;
