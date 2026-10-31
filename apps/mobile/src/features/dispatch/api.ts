import { friendlyDbError, readSearchSnapshot, toDateString, type SearchSnapshot } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";
import { EmailNotVerifiedError } from "@/features/customer/booking-api";
import type { ServiceRow, SubItemRow } from "@/features/customer/types";

/** "Now", or a slot the customer picked on the clock (date YYYY-MM-DD, time HH:MM:SS). */
export type RequestWhen = { kind: "now" } | { kind: "later"; date: string; time: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** The date and time saved for a "Now" request: the phone's current minute. */
export function nowSlot(now: Date): { date: string; time: string } {
  return { date: toDateString(now), time: `${pad(now.getHours())}:${pad(now.getMinutes())}:00` };
}

function snapshot(data: unknown): SearchSnapshot {
  const s = readSearchSnapshot(data);
  if (!s) throw new Error("Could not read the search. Please try again.");
  return s;
}

/**
 * Books the service with NO pro and starts the search (proposal 20261124000000). The database sets the price
 * (catalogue price, platform fee 0) and refuses an address outside the city or a second search; its message is shown
 * as written. If the search cannot start, the empty booking is cancelled so it never lingers.
 */
export async function requestPro(args: {
  userId: string;
  customerName: string | null;
  customerPhone: string | null;
  service: ServiceRow;
  subItem: SubItemRow | null;
  when: RequestWhen;
  address: string;
  city: string;
  pincode: string;
  point: { latitude: number; longitude: number };
  notes: string | null;
  now: Date;
}): Promise<{ bookingId: string; search: SearchSnapshot }> {
  const slot = args.when.kind === "now" ? nowSlot(args.now) : { date: args.when.date, time: args.when.time };
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      customer_id: args.userId,
      provider_id: null,
      service_id: args.service.id,
      booking_date: slot.date,
      booking_time: slot.time,
      scheduled_date: slot.date,
      scheduled_time: slot.time,
      address: args.address,
      city: args.city,
      pincode: args.pincode,
      special_instructions: args.notes,
      description: args.notes,
      latitude: args.point.latitude,
      longitude: args.point.longitude,
      status: "pending",
      customer_name: args.customerName,
      customer_phone: args.customerPhone,
      sub_item_id: args.subItem?.id ?? null,
      sub_item_name: args.subItem?.name ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42501" || /row-level security/i.test(error.message)) throw new EmailNotVerifiedError();
    throw new Error(friendlyDbError(error));
  }
  const bookingId = (data as { id: string }).id;
  const started = await supabase.rpc("start_dispatch", { p_booking_id: bookingId });
  if (started.error) {
    await supabase.from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: "Search could not start" })
      .eq("id", bookingId);
    throw new Error(friendlyDbError(started.error));
  }
  return { bookingId, search: snapshot(started.data) };
}

export async function fetchSearch(bookingId: string): Promise<SearchSnapshot> {
  const { data, error } = await getSupabase().rpc("get_search_state", { p_booking_id: bookingId });
  if (error) throw new Error(friendlyDbError(error));
  return snapshot(data);
}

/** Free while searching. Returns the database's answer ("cancelled", or "assigned" with a message). */
export async function cancelSearch(bookingId: string): Promise<{ result: string; message?: string }> {
  const { data, error } = await getSupabase().rpc("cancel_search", { p_booking_id: bookingId });
  if (error) throw new Error(friendlyDbError(error));
  return (data ?? { result: "cancelled" }) as { result: string; message?: string };
}

/** "Keep looking for 10 more minutes". */
export async function keepLooking(bookingId: string): Promise<SearchSnapshot> {
  const { data, error } = await getSupabase().rpc("extend_search", { p_booking_id: bookingId });
  if (error) throw new Error(friendlyDbError(error));
  return snapshot(data);
}

export const searchKey = (bookingId: string) => ["dispatch-search", bookingId] as const;
