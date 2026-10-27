import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase";

/**
 * Keeps one booking screen live: Realtime refreshes the booking row and the pro's position the moment they change.
 * (The screens also poll as a safety net, because a mobile connection can drop a Realtime channel silently.)
 */
export function useBookingLive(bookingId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!bookingId || !enabled) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`booking-${bookingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
        void queryClient.invalidateQueries({ queryKey: ["customer-bookings"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_locations", filter: `booking_id=eq.${bookingId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["provider-location", bookingId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId, enabled, queryClient]);
}
