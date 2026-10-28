import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { inr } from "@/lib/pricing";

const sb = supabase as any;

type Pro = { provider_id: string; full_name: string; rating: number; total_jobs: number; price: number };

type Props = {
  bookingId: string;
  reason: "declined" | "no_answer";
  fallbackHref: string;
};

/** Same area, similar price: the customer taps one and the request moves to that pro. */
export default function NextBestPros({ bookingId, reason, fallbackHref }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pros, setPros] = useState<Pro[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    sb.rpc("get_next_best_pros", { p_booking_id: bookingId }).then(({ data }: { data: Pro[] | null }) => {
      if (alive) setPros(data ?? []);
    });
    return () => { alive = false; };
  }, [bookingId]);

  const pick = async (pro: Pro) => {
    setSwitching(pro.provider_id);
    const { data, error } = await sb.rpc("rebook_with_provider", { p_booking_id: bookingId, p_provider_id: pro.provider_id });
    setSwitching(null);
    if (error || !data?.ok) {
      toast({
        title: "Could not send to this pro",
        description: data?.reason === "provider_unavailable" ? "They just went offline. Pick another pro." : error?.message ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: `Request sent to ${pro.full_name}`, description: `Same date and address, locked price ${inr(pro.price)}.` });
    navigate(`/booking-confirmation/${data.booking_id}`, { replace: true });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">
          {reason === "declined" ? "This pro can't make it. Pick one of the next best pros" : "No answer yet? These pros are ready"}
        </h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Same area, similar price. Your date, address and notes stay the same.</p>

      {pros === null ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : pros.length === 0 ? (
        <div className="text-center">
          <p className="mb-3 text-sm text-muted-foreground">No other pros are online in your area right now.</p>
          <Button variant="outline" className="rounded-xl" onClick={() => navigate(fallbackHref)}>Browse all pros</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {pros.map((p) => (
            <div key={p.provider_id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-gradient-gold font-bold text-primary-foreground">{(p.full_name || "P")[0]}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.full_name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {Number(p.rating).toFixed(1)} · {p.total_jobs} jobs
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold">{inr(p.price)}</p>
                <Button size="sm" className="mt-1 h-7 rounded-lg bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
                  disabled={switching !== null} onClick={() => pick(p)}>
                  {switching === p.provider_id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Book"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
