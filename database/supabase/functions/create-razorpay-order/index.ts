// Edge Function: create-razorpay-order
// The customer taps "Pay". The browser sends ONLY a booking id. The amount is read from the database
// here, so it can never be chosen by the client.
//
// Deploy:  supabase functions deploy create-razorpay-order
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET  (SUPABASE_* are provided automatically)
//
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, makeJson } from "../_shared/cors.ts";
import { basicAuth, checkPayable, toPaise } from "../_shared/razorpay.ts";
import type { PayableBooking } from "../_shared/razorpay.ts";

declare const Deno: { env: { get: (name: string) => string | undefined } };

const STATUS: Record<string, number> = {
  not_found: 404, forbidden: 403, not_completed: 409, already_paid: 409, refunded: 409, bad_amount: 409,
};

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  const json = makeJson(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed", code: "method" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!url || !anonKey || !serviceKey || !keyId || !keySecret) return json({ error: "Payments are not configured", code: "config" }, 500);

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.booking_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return json({ error: "Invalid booking", code: "not_found" }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: booking } = await admin.from("bookings")
      .select("id, customer_id, user_id, provider_id, status, payment_status, total_amount, customer_name, customer_phone, services(name)")
      .eq("id", bookingId).maybeSingle();

    const problem = checkPayable(booking as PayableBooking | null, user.id);
    if (problem) return json({ error: problem, code: problem }, STATUS[problem] ?? 400);

    const amountPaise = toPaise(Number(booking.total_amount));
    const prefill = { name: booking.customer_name ?? "", contact: booking.customer_phone ?? "", email: user.email ?? "" };
    const description = (booking.services as { name?: string } | null)?.name ?? "Home service";

    // Reuse an open order for the same amount so a double-tap or retry never creates stray orders.
    const { data: open } = await admin.from("payments").select("razorpay_order_id, amount_paise")
      .eq("booking_id", bookingId).eq("status", "created").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (open && open.amount_paise === amountPaise) {
      return json({ order_id: open.razorpay_order_id, amount: amountPaise, currency: "INR", key_id: keyId, prefill, description });
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: basicAuth(keyId, keySecret) },
        body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: bookingId, notes: { booking_id: bookingId } }),
        signal: ctl.signal,
      });
    } finally { clearTimeout(timer); }

    if (!res.ok) {
      console.error("[create-razorpay-order] razorpay", res.status, (await res.text()).slice(0, 300));
      return json({ error: "The payment provider is unavailable. Try again.", code: "gateway" }, 502);
    }
    const order = await res.json();

    const { error: insErr } = await admin.from("payments").insert({
      booking_id: bookingId, customer_id: user.id, provider_id: booking.provider_id,
      razorpay_order_id: order.id, amount_paise: amountPaise, currency: "INR", status: "created",
    });
    if (insErr) {
      console.error("[create-razorpay-order] insert", insErr.message);
      return json({ error: "Could not start the payment. Try again.", code: "unexpected" }, 500);
    }

    return json({ order_id: order.id, amount: amountPaise, currency: "INR", key_id: keyId, prefill, description });
  } catch (e) {
    console.error("[create-razorpay-order] unexpected", e);
    return json({ error: "Something went wrong. Please try again.", code: "unexpected" }, 500);
  }
});
