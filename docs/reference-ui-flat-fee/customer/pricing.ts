import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export type Band = { base: number; min: number; max: number };

/** Band for a catalogue row (service or sub-service). Missing min/max = catalogue price only. */
export function bandOf(row: Record<string, unknown> | null | undefined): Band | null {
  if (!row) return null;
  const base = Number(row.base_price ?? 0);
  if (!(base > 0)) return null;
  const min = row.price_min != null ? Number(row.price_min) : base;
  const max = row.price_max != null ? Number(row.price_max) : base;
  return { base, min, max };
}

/** The price a pro charges: their rate if set, always clamped to the band (mirrors quote_price()). */
export function priceFor(band: Band | null, rate: number | null | undefined): number | null {
  if (!band) return rate ?? null;
  const raw = rate ?? band.base;
  return Math.round(Math.min(band.max, Math.max(band.min, raw)));
}

export type BookingProvider = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  rating: number | null;
  total_jobs: number | null;
  phone: string | null;
};

/** The customer's view of the pro on a booking (phone only after confirmation). */
export function useBookingProvider(bookingId: string | undefined, status: string | undefined) {
  const [provider, setProvider] = useState<BookingProvider | null>(null);
  useEffect(() => {
    if (!bookingId) return;
    let alive = true;
    sb.rpc("get_booking_provider", { p_booking_id: bookingId }).then(({ data }: { data: BookingProvider | null }) => {
      if (alive) setProvider(data ?? null);
    });
    return () => { alive = false; };
  }, [bookingId, status]);
  return provider;
}
