import {
  isBookingTime, isSlotAvailable, nextBestPros, parseDateString, quoteBooking, reconcileQuote, toDateString, toDbTime,
  type BookingQuote, type BookingSlot, type NewBookingInput, type QuoteCheck, type StoredTotals,
} from "@handyfix/shared";
import { copyBookingAttachments } from "@/features/attachments/api";
import { getSupabase } from "@/lib/supabase";
import { fetchProviderListings, fetchSubItems } from "./catalog-api";
import type { ProviderListing, ServiceRow, SubItemRow } from "./types";

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
  created_at: string | null;
  booking_date: string | null;
  booking_time: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  special_instructions: string | null;
  sub_item_id: string | null;
  sub_item_name: string | null;
  provider_id: string | null;
  service_id: string | null;
  provider_amount: number | null;
  platform_fee: number | null;
  total_amount: number | null;
  latitude: number | null;
  longitude: number | null;
  provider_eta_minutes: number | null;
  cancellation_reason: string | null;
};

const BOOKING_COLUMNS =
  "id, status, created_at, booking_date, booking_time, address, city, pincode, special_instructions, sub_item_id, sub_item_name, provider_id, service_id, provider_amount, platform_fee, total_amount, latitude, longitude, provider_eta_minutes, cancellation_reason";

export async function fetchBooking(id: string): Promise<{ booking: BookingRow; serviceName: string | null; providerName: string | null } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("bookings").select(BOOKING_COLUMNS).eq("id", id).maybeSingle();
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

/** The 4-digit code the customer gives the pro at the end. Only the booking's own customer can read it (RLS). */
/** The booking's 4-digit code (customer-only by RLS). Null when the database has no code for this booking. */
export async function fetchCompletionCode(bookingId: string): Promise<string | null> {
  const { data, error } = await getSupabase().from("booking_completion_codes").select("code").eq("booking_id", bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { code: string } | null)?.code ?? null;
}

/**
 * The pro's phone, only after they accept (PDF p.2). Needs the server function in
 * supabase/proposals/…customer_booking_contact; until it exists this returns null and the Call button stays hidden.
 */
export async function fetchProviderPhone(bookingId: string): Promise<string | null> {
  const { data, error } = await getSupabase().rpc("get_booking_provider_phone", { p_booking_id: bookingId });
  if (error) return null;
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

export type ProviderPosition = { latitude: number; longitude: number; updated_at: string };

export async function fetchProviderLocation(bookingId: string): Promise<ProviderPosition | null> {
  const { data, error } = await getSupabase().from("provider_locations").select("latitude, longitude, updated_at").eq("booking_id", bookingId).maybeSingle();
  if (error || !data) return null;
  const row = data as { latitude: number; longitude: number; updated_at: string };
  return { latitude: Number(row.latitude), longitude: Number(row.longitude), updated_at: row.updated_at };
}

export type CustomerBookingListItem = {
  id: string;
  status: string;
  created_at: string | null;
  booking_date: string | null;
  booking_time: string | null;
  sub_item_name: string | null;
  total_amount: number | null;
  serviceName: string | null;
  providerName: string | null;
};

export async function fetchCustomerBookings(userId: string): Promise<CustomerBookingListItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, created_at, booking_date, booking_time, provider_id, sub_item_name, total_amount, services(name)")
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  type Row = Omit<CustomerBookingListItem, "serviceName" | "providerName"> & { provider_id: string | null; services: { name: string } | { name: string }[] | null };
  const rows = (data ?? []) as Row[];

  const ids = [...new Set(rows.map((r) => r.provider_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: pros } = await supabase.from("public_providers").select("id, full_name").in("id", ids);
    for (const p of (pros ?? []) as { id: string; full_name: string | null }[]) if (p.full_name) names.set(p.id, p.full_name);
  }
  return rows.map((r) => {
    const svc = Array.isArray(r.services) ? r.services[0] : r.services;
    return { ...r, serviceName: svc?.name ?? null, providerName: r.provider_id ? (names.get(r.provider_id) ?? null) : null };
  });
}

/**
 * Other pros for the same job after a decline, when the customer asks, or once the time has passed: same area, similar price, online, best ranked.
 * Needs no database change: it reads the same public list the customer browsed.
 */
export async function fetchAlternatives(booking: BookingRow): Promise<{ service: ServiceRow; subItem: SubItemRow | null; pros: ProviderListing[] } | null> {
  if (!booking.service_id) return null;
  const { data: svc, error } = await getSupabase()
    .from("services").select("id, name, slug, description, icon_name, base_price, duration_minutes, category").eq("id", booking.service_id).maybeSingle();
  if (error || !svc) return null;
  const service = svc as ServiceRow;
  const subItem = booking.sub_item_id ? ((await fetchSubItems(service.id)).find((s) => s.id === booking.sub_item_id) ?? null) : null;

  const listings = await fetchProviderListings({ service, subItem, area: "", now: new Date() });
  const pros = nextBestPros({
    candidates: listings,
    excludeIds: new Set(booking.provider_id ? [booking.provider_id] : []),
    requestedPrice: Number(booking.provider_amount ?? subItem?.base_price ?? service.base_price ?? 0),
    pincode: booking.pincode ?? "",
    city: booking.city,
  });
  return { service, subItem, pros };
}

/**
 * The customer picked another pro: book the same job (same slot, address and notes) with them, then cancel the
 * unanswered request. If the slot has already passed the caller falls back to the normal booking flow.
 */
export async function rebookWithProvider(args: {
  userId: string;
  customerName: string | null;
  customerPhone: string | null;
  old: BookingRow;
  service: ServiceRow;
  subItem: SubItemRow | null;
  pro: ProviderListing;
  now: Date;
}): Promise<CreatedBooking | { slotPassed: true }> {
  const { old, now } = args;
  const date = old.booking_date ? parseDateString(old.booking_date) : null;
  const slot = (old.booking_time ?? "").slice(0, 5) as BookingSlot;
  if (!date || !isBookingTime(slot) || !isSlotAvailable(date, slot, now)) return { slotPassed: true };

  const created = await createBooking({
    userId: args.userId,
    customerName: args.customerName,
    customerPhone: args.customerPhone,
    service: args.service,
    subItem: args.subItem,
    providerId: args.pro.id,
    input: {
      date: old.booking_date!, time: slot, address: old.address ?? "", city: old.city ?? "", pincode: old.pincode ?? "",
      latitude: old.latitude, longitude: old.longitude, notes: old.special_instructions ?? undefined,
    },
    quote: quoteBooking(args.pro.price),
  });
  // The next pro sees the same photos and voice note.
  await copyBookingAttachments(args.userId, old.id, created.id).catch(() => undefined);
  if (old.status === "pending") await cancelBooking(old.id).catch(() => undefined);
  return created;
}

/** Customers can cancel while a booking is still pending or confirmed. */
export async function cancelBooking(id: string) {
  const { error } = await getSupabase()
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: "Cancelled by customer" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
