import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import LiveMap from "@/components/LiveMap";

type Pt = { latitude: number; longitude: number };
// provider_locations isn't in the generated types, so go through an untyped client like MyBookings does.
const sb = supabase as unknown as any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Live provider pin on a map, streamed via realtime while the pro is travelling. */
const TrackingMap = ({ bookingId, destination, etaMinutes, arrived }: { bookingId: string; destination: Pt; etaMinutes?: number | null; arrived: boolean }) => {
  const [pro, setPro] = useState<Pt | null>(null);

  useEffect(() => {
    let alive = true;
    void sb.from("provider_locations").select("latitude, longitude").eq("booking_id", bookingId).maybeSingle()
      .then(({ data }: { data: Pt | null }) => { if (alive && data) setPro(data); });
    const ch = sb.channel(`track-${bookingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_locations", filter: `booking_id=eq.${bookingId}` },
        (p: { new?: Pt }) => { if (p.new?.latitude && p.new?.longitude) setPro({ latitude: p.new.latitude, longitude: p.new.longitude }); })
      .subscribe();
    return () => { alive = false; void sb.removeChannel(ch); };
  }, [bookingId]);

  const markers = [
    { ...destination, label: "Your address", color: "gold" as const },
    ...(pro && !arrived ? [{ ...pro, label: "Your pro", color: "blue" as const }] : []),
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative overflow-hidden rounded-3xl">
      <LiveMap markers={markers} height="260px" />
      <div className="absolute inset-x-3 bottom-3 z-[500] flex items-center justify-between rounded-2xl bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <span className="text-sm font-bold">{arrived ? "Your pro has arrived" : pro ? "Live location" : "Waiting for location…"}</span>
        {!arrived && etaMinutes ? <span className="rounded-full bg-gold px-3 py-1 text-xs font-extrabold text-gold-foreground">~{etaMinutes} min</span> : null}
      </div>
    </motion.div>
  );
};

export default TrackingMap;
