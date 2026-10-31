import { acceptOutcome, friendlyDbError, readOfferCard, type AcceptOutcome, type OfferCard } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";

/** An offer waiting for this pro (`booking_offers`, own rows only by RLS). */
export type OpenOffer = { bookingId: string; offeredAt: string; ring: number; distanceKm: number };

/**
 * Open offers, oldest first. Before proposal 20261124000000 is applied the table does not exist: no offers, no error
 * (the Pro app must keep working on the old flow).
 */
export async function fetchOpenOffers(): Promise<OpenOffer[]> {
  const { data, error } = await getSupabase()
    .from("booking_offers")
    .select("booking_id, offered_at, ring, distance_km")
    .eq("status", "offered")
    .order("offered_at", { ascending: true })
    .limit(20);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /booking_offers/.test(error.message)) return [];
    throw new Error(friendlyDbError(error));
  }
  return ((data ?? []) as { booking_id: string; offered_at: string; ring: number; distance_km: number | string }[])
    .map((r) => ({ bookingId: r.booking_id, offeredAt: r.offered_at, ring: Number(r.ring), distanceKm: Number(r.distance_km) }));
}

export async function fetchOfferCard(bookingId: string): Promise<OfferCard> {
  const { data, error } = await getSupabase().rpc("get_offer_card", { p_booking_id: bookingId });
  if (error) throw new Error(friendlyDbError(error));
  const card = readOfferCard(data);
  if (!card) throw new Error("Could not read this job. Please try again.");
  return card;
}

/** First accept wins (row lock in the database). Never throws for "taken" / "expired": those are normal answers. */
export async function acceptOffer(bookingId: string): Promise<AcceptOutcome> {
  const { data, error } = await getSupabase().rpc("accept_dispatch_offer", { p_booking_id: bookingId });
  if (error) throw new Error(friendlyDbError(error));
  return acceptOutcome(data, bookingId);
}

/**
 * The heartbeat with position, so the server can find pros near a customer. Only while online (the database ignores
 * an offline pro). Best effort: before the proposal is applied the function does not exist, and a failure here must
 * never take a pro offline.
 */
export async function reportPresence(point: { latitude: number; longitude: number; accuracy?: number | null }): Promise<void> {
  try {
    await getSupabase().rpc("report_presence", {
      p_lat: point.latitude, p_lng: point.longitude, p_accuracy: point.accuracy == null ? null : Math.round(point.accuracy),
    });
  } catch {
    /* the plain heartbeat still keeps the pro listed */
  }
}

export const offersKey = (providerId: string | null) => ["dispatch-offers", providerId] as const;
export const offerCardKey = (bookingId: string) => ["dispatch-offer-card", bookingId] as const;
