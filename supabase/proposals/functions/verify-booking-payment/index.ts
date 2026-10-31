// PROPOSAL, NOT DEPLOYED. New function (Payments Section 2, 2026-10-30). Deploy after 20261122000000:
//   npx supabase functions deploy verify-booking-payment --project-ref jviwwhjwtyneqrguumro
//
// Lets the customer's app say "Payment verified" the moment Razorpay Checkout returns, by checking
//   razorpay_signature == HMAC_SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)
// It NEVER credits anyone and never marks anything paid: only razorpay-webhook does that (record_booking_payment,
// once per payment). The order must belong to a booking of the signed-in customer.

// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get: (name: string) => string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sameSignature(message: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!url || !anonKey || !serviceKey || !keySecret) return json({ error: "Server is not configured" }, 500);

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Please sign in again" }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.razorpay_order_id ?? "");
    const paymentId = String(body?.razorpay_payment_id ?? "");
    const signature = String(body?.razorpay_signature ?? "");
    if (!orderId || !paymentId || !signature) return json({ verified: false, error: "Missing payment details" }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: order } = await admin
      .from("booking_payment_orders")
      .select("razorpay_order_id, status, amount_paise, booking_id, bookings!inner(customer_id, user_id)")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();
    const owner = order?.bookings as { customer_id: string | null; user_id: string | null } | undefined;
    if (!order || !owner || (owner.customer_id !== user.id && owner.user_id !== user.id)) {
      return json({ verified: false, error: "Payment not found" }, 404);
    }

    const verified = await sameSignature(`${orderId}|${paymentId}`, signature, keySecret);
    // paid = the webhook has already recorded it (the app still waits for bookings.payment_status from the database).
    return json({ verified, paid: order.status === "paid", amount_paise: order.amount_paise, booking_id: order.booking_id });
  } catch (e) {
    console.error("verify-booking-payment:", e);
    return json({ verified: false, error: "Could not check the payment" }, 500);
  }
});
