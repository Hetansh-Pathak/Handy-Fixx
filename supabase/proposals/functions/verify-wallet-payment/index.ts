// PROPOSAL, NOT DEPLOYED. New function (owner decision 2026-10-29). Deploy:  supabase functions deploy verify-wallet-payment
//
// Lets the app show "Payment received" the moment Razorpay Checkout returns, by checking
//   razorpay_signature == HMAC_SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)
// It NEVER credits the wallet: only razorpay-webhook does that (exactly once, after Razorpay confirms the capture).
// The order must belong to the signed-in pro.

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
      .from("wallet_topup_orders")
      .select("order_id, status, amount, service_providers!inner(user_id)")
      .eq("order_id", orderId)
      .eq("service_providers.user_id", user.id)
      .maybeSingle();
    if (!order) return json({ verified: false, error: "Payment not found" }, 404);

    const verified = await sameSignature(`${orderId}|${paymentId}`, signature, keySecret);
    // credited = the webhook has already added it to the ledger.
    return json({ verified, credited: order.status === "paid", amount: order.amount });
  } catch (e) {
    console.error("verify-wallet-payment:", e);
    return json({ verified: false, error: "Could not check the payment" }, 500);
  }
});
