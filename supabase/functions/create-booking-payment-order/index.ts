// DEPLOYABLE COPY of supabase/proposals/functions/create-booking-payment-order (copied 2026-10-31, Payments Section 2). NOT deployed until the owner
// approves; order in docs/PAYMENTS_SETUP.md "Booking payments". Keep both copies identical below this header.
// Originally: New function (Payments Section 1, owner decision 2026-10-30).
// Deploy (after proposal 20261122000000 is applied):
//   npx supabase functions deploy create-booking-payment-order --project-ref jviwwhjwtyneqrguumro
//
// Creates (or reuses) a Razorpay order so a customer can pay for a completed booking in the app.
// * The caller must be the booking's customer.
// * The amount comes ONLY from the database (booking_payable_paise); the app never sends an amount.
// * An open unpaid order for the same booking and amount is reused instead of creating a new one.
// * At most 5 new orders per customer per 10 minutes (like create-wallet-topup-order).
// * Razorpay notes { type: "booking_payment", booking_id } so the webhook can tell it from a wallet top-up.
// It never marks anything paid: that is the webhook's job (Section 2).

// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get: (name: string) => string | undefined } };

const MAX_ORDERS = 5;
const WINDOW_MINUTES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function razorpay(path: string, method: "GET" | "POST", body?: unknown) {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) throw new Error("Razorpay keys are not configured");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description ?? `Razorpay error ${res.status}`);
  return data;
}

/** Why the database said there is nothing to pay, in the customer's words. */
function notPayableMessage(b: { status: string; payment_status: string | null }): string {
  if (b.status === "cancelled") return "This booking was cancelled, so there is nothing to pay.";
  if (b.status !== "completed") return "You can pay online once the job is completed.";
  if (b.payment_status === "paid") return "This booking is already paid.";
  if (b.payment_status === "pending") return "Your payment is being confirmed. Please wait a moment.";
  return "This booking cannot be paid online right now. You can pay the pro directly.";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Server is not configured" }, 500);

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Please sign in again" }, 401);

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.booking_id ?? "");
    if (!UUID.test(bookingId)) return json({ error: "Booking not found" }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: booking } = await admin
      .from("bookings")
      .select("id, customer_id, user_id, status, payment_status, customer_name, customer_phone")
      .eq("id", bookingId)
      .maybeSingle();
    // Same answer for "missing" and "not yours", so ids cannot be probed.
    if (!booking || (booking.customer_id !== user.id && booking.user_id !== user.id)) return json({ error: "Booking not found" }, 404);

    // The amount comes from the database only (service role: the function sees any booking it was allowed past above).
    const { data: amountPaise, error: amountError } = await admin.rpc("booking_payable_paise", { p_booking_id: bookingId });
    if (amountError) throw amountError;
    const amount = Number(amountPaise);
    if (!amountPaise || !Number.isInteger(amount) || amount <= 0) return json({ error: notPayableMessage(booking) }, 409);

    const reply = (orderId: string) =>
      json({
        order_id: orderId,
        amount_paise: amount,
        key_id: Deno.env.get("RAZORPAY_KEY_ID"),
        prefill: { name: booking.customer_name ?? "", email: user.email ?? "", contact: booking.customer_phone ?? "" },
      });

    // Reuse an open unpaid order for the same booking and amount (a second tap, or coming back to the screen).
    const { data: open } = await admin
      .from("booking_payment_orders")
      .select("razorpay_order_id")
      .eq("booking_id", bookingId)
      .eq("status", "created")
      .eq("amount_paise", amount)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open?.razorpay_order_id) return reply(open.razorpay_order_id);

    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await admin
      .from("booking_payment_orders")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_ORDERS) return json({ error: "Too many payment attempts. Wait a few minutes and try again." }, 429);

    const order = await razorpay("/orders", "POST", {
      amount,
      currency: "INR",
      receipt: `bk_${bookingId.slice(0, 8)}_${Date.now()}`,
      notes: { type: "booking_payment", booking_id: bookingId },
    });

    const { error } = await admin.from("booking_payment_orders").insert({
      booking_id: bookingId,
      razorpay_order_id: order.id,
      amount_paise: amount,
      created_by: user.id,
    });
    if (error) throw error;

    return reply(order.id);
  } catch (e) {
    console.error("create-booking-payment-order:", e);
    return json({ error: "Could not start the payment. Please try again." }, 500);
  }
});
