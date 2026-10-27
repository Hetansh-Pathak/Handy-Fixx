import {
  reconcileQuote, toDateString, toDbTime, type BookingQuote, type NewBookingInput, type QuoteCheck, type StoredTotals,
  parseDateString, type BookingSlot,
} from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";
import type { ServiceRow, SubItemRow } from "./types";

/** The database refused the insert because the customer's email is not verified yet (RLS). */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super("Verify your email before booking.");
    this.name = "EmailNotVerifiedError";
  }
}

export type CreatedBooking = { id: string; stored: StoredTotals; check: QuoteCheck };

export async function createBooking(args: {
  userId: string;
  customerName: string | null;
  customerPhone: string | null;
  service: ServiceRow;
  subItem: SubItemRow | null;
  providerId: string;
  input: NewBookingInput;
  quote: BookingQuote;
}): Promise<CreatedBooking> {
  const { input, quote } = args;
  const date = parseDateString(input.date);
  if (!date) throw new Error("Pick a valid date.");
  const day = toDateString(date);
  const time = toDbTime(input.time as BookingSlot);

  const payload: Record<string, unknown> = {
    customer_id: args.userId,
    provider_id: args.providerId,
    service_id: args.service.id,
    booking_date: day,
    booking_time: time,
    scheduled_date: day,
    scheduled_time: time,
    address: input.address,
    city: input.city,
    pincode: input.pincode,
    special_instructions: input.notes ?? null,
    description: input.notes ?? null,
    // The database decides the final price. These are the PDF model's values; the result is reconciled below.
    provider_amount: quote.servicePrice,
    platform_fee: quote.platformFee,
    total_amount: quote.total,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    status: "pending",
    customer_name: args.customerName,
    customer_phone: args.customerPhone,
    sub_item_id: args.subItem?.id ?? null,
    sub_item_name: args.subItem?.name ?? null,
  };

  const supabase = getSupabase();
  const columns = "id, provider_amount, platform_fee, total_amount";
  let { data, error } = await supabase.from("bookings").insert(payload).select(columns).single();

  // Older databases without the live-location columns: retry once without coordinates.
  if (error && /latitude|longitude|schema cache/i.test(error.message)) {
    const { latitude: _lat, longitude: _lng, ...withoutCoords } = payload;
    ({ data, error } = await supabase.from("bookings").insert(withoutCoords).select(columns).single());
  }

  if (error) {
    if (error.code === "42501" || /row-level security/i.test(error.message)) throw new EmailNotVerifiedError();
    throw new Error(error.message);
  }
  const row = data as { id: string } & StoredTotals;
  return { id: row.id, stored: row, check: reconcileQuote(quote, row) };
}

export type BookingRow = {
  id: string;
  status: string;
  booking_date: string | null;
  booking_time: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  sub_item_name: string | null;
  provider_id: string | null;
  service_id: string | null;
  provider_amount: number | null;
  platform_fee: number | null;
  total_amount: number | null;
};

export async function fetchBooking(id: string): Promise<{ booking: BookingRow; serviceName: string | null; providerName: string | null } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, booking_date, booking_time, address, city, pincode, sub_item_name, provider_id, service_id, provider_amount, platform_fee, total_amount")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const booking = data as BookingRow;

  const [service, provider] = await Promise.all([
    booking.service_id ? supabase.from("services").select("name").eq("id", booking.service_id).maybeSingle() : Promise.resolve({ data: null }),
    booking.provider_id ? supabase.from("public_providers").select("full_name").eq("id", booking.provider_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    booking,
    serviceName: (service.data as { name: string } | null)?.name ?? null,
    providerName: (provider.data as { full_name: string | null } | null)?.full_name ?? null,
  };
}

/** Customers can cancel while a booking is still pending or confirmed. */
export async function cancelBooking(id: string) {
  const { error } = await getSupabase()
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: "Cancelled by customer" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
