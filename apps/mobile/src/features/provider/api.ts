import {
  callEdge, friendlyAuthError, interpretPayout, type BookingPatch, type CompletionResult, type LedgerEntry, type PayoutRequestResult, type WalletSummary,
} from "@handyfix/shared";
import type { CheckoutOrder } from "@/lib/razorpay";
import { getSupabase } from "@/lib/supabase";

export type ProviderBooking = {
  id: string;
  status: string;
  created_at: string | null;
  booking_date: string | null;
  booking_time: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  latitude: number | null;
  longitude: number | null;
  provider_amount: number | null;
  total_amount: number | null;
  sub_item_name: string | null;
  special_instructions: string | null;
  services: { name: string } | { name: string }[] | null;
};

const BOOKING_COLUMNS =
  "id, status, created_at, booking_date, booking_time, address, city, pincode, customer_name, customer_phone, latitude, longitude, provider_amount, total_amount, sub_item_name, special_instructions, services(name)";

export const serviceNameOf = (b: ProviderBooking): string => {
  const s = Array.isArray(b.services) ? b.services[0] : b.services;
  return b.sub_item_name ?? s?.name ?? "Service";
};

/** The database may raise a readable rule (e.g. "Wallet below the fee…"): show it as written. */
function readable(error: { message: string; code?: string }): Error {
  return new Error(error.code === "P0001" ? error.message : friendlyAuthError(error.message));
}

/** Going online/offline. The database can keep a pro offline (not approved), so it returns the real value. */
export async function setOnline(providerId: string, online: boolean): Promise<boolean> {
  const { data, error } = await getSupabase().from("service_providers").update({ is_online: online }).eq("id", providerId).select("is_online").maybeSingle();
  if (error) throw readable(error);
  return Boolean((data as { is_online: boolean | null } | null)?.is_online);
}

/** The "I'm still here" heartbeat. Customers only see pros whose row changed in the last 90 seconds. */
export async function touchPresence(providerId: string): Promise<void> {
  const { error } = await getSupabase().from("service_providers").update({ is_online: true }).eq("id", providerId);
  if (error) throw readable(error);
}

export async function fetchPendingRequests(providerId: string): Promise<ProviderBooking[]> {
  const { data, error } = await getSupabase()
    .from("bookings").select(BOOKING_COLUMNS).eq("provider_id", providerId).eq("status", "pending").order("created_at", { ascending: true });
  if (error) throw readable(error);
  return (data ?? []) as ProviderBooking[];
}

export async function fetchProviderBookings(providerId: string): Promise<ProviderBooking[]> {
  const { data, error } = await getSupabase()
    .from("bookings").select(BOOKING_COLUMNS).eq("provider_id", providerId).order("created_at", { ascending: false }).limit(100);
  if (error) throw readable(error);
  return (data ?? []) as ProviderBooking[];
}

export async function fetchProviderBooking(id: string): Promise<ProviderBooking | null> {
  const { data, error } = await getSupabase().from("bookings").select(BOOKING_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw readable(error);
  return (data as ProviderBooking | null) ?? null;
}

export async function applyBookingPatch(bookingId: string, providerId: string, patch: BookingPatch): Promise<void> {
  const { error } = await getSupabase().from("bookings").update(patch).eq("id", bookingId).eq("provider_id", providerId);
  if (error) throw readable(error);
}

/** The only way a job can be completed: the customer's 4-digit code, checked by the database. */
export async function completeWithCode(bookingId: string, code: string): Promise<CompletionResult> {
  const { data, error } = await getSupabase().rpc("complete_booking_with_code", { p_booking_id: bookingId, p_code: code });
  if (error) throw readable(error);
  return data as CompletionResult;
}

export async function fetchWalletSummary(): Promise<WalletSummary> {
  const { data, error } = await getSupabase().rpc("get_wallet_summary");
  if (error) throw readable(error);
  const d = (data ?? {}) as Partial<Record<keyof WalletSummary, number | string>>;
  const n = (v: number | string | undefined) => Number(v ?? 0) || 0;
  return { balance: n(d.balance), dues: n(d.dues), available: n(d.available) };
}

/** Live position for the customer's map. `provider_locations.provider_id` is the AUTH user id, not the provider row id. */
export async function upsertProviderLocation(args: { bookingId: string; userId: string; latitude: number; longitude: number }) {
  const { error } = await getSupabase().from("provider_locations").upsert(
    { booking_id: args.bookingId, provider_id: args.userId, latitude: args.latitude, longitude: args.longitude, updated_at: new Date().toISOString() },
    { onConflict: "booking_id" },
  );
  if (error) throw readable(error);
}

export async function updateEta(bookingId: string, providerId: string, minutes: number) {
  const { error } = await getSupabase().from("bookings").update({ provider_eta_minutes: minutes }).eq("id", bookingId).eq("provider_id", providerId);
  if (error) throw readable(error);
}

// ─── wallet screen ───────────────────────────────────────────────────────────

export type PayoutRow = { id: string; amount: number | string; status: string; created_at: string };

/** Ledger rows are readable by their own provider (RLS `wallet_tx_provider_read`). */
export async function fetchLedger(providerId: string, limit = 40): Promise<LedgerEntry[]> {
  const { data, error } = await getSupabase()
    .from("wallet_transactions").select("id, type, amount, note, booking_id, created_at")
    .eq("provider_id", providerId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw readable(error);
  return (data ?? []) as LedgerEntry[];
}

export async function fetchPayouts(providerId: string): Promise<PayoutRow[]> {
  const { data, error } = await getSupabase()
    .from("payout_requests").select("id, amount, status, created_at")
    .eq("provider_id", providerId).order("created_at", { ascending: false }).limit(10);
  if (error) throw readable(error);
  return (data ?? []) as PayoutRow[];
}

/** Smallest withdrawal the admin allows (`wallet_settings.min_payout`); null if the table can't be read. */
export async function fetchMinPayout(): Promise<number | null> {
  const { data, error } = await getSupabase().from("wallet_settings").select("min_payout").maybeSingle();
  if (error || !data) return null;
  return Number((data as { min_payout: number | string }).min_payout) || null;
}

export async function createTopUpOrder(amount: number): Promise<CheckoutOrder> {
  return callEdge<CheckoutOrder>(getSupabase(), "create-wallet-topup-order", { amount });
}

export async function requestPayout(amount: number): Promise<PayoutRequestResult> {
  const { data, error } = await getSupabase().rpc("request_payout", { p_amount: amount });
  if (error) throw readable(error);
  return interpretPayout(data);
}
