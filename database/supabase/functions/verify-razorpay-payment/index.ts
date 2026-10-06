// Edge Function: verify-razorpay-payment
// Called by the browser right after Razorpay Checkout succeeds. Three independent checks before a
// booking is marked paid: (1) the signature, (2) the order belongs to the caller, (3) Razorpay itself says
// the payment is captured for the stored amount. The webhook does the same job if this call never arrives.
//
// Deploy:  supabase functions deploy verify-razorpay-payment
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
//
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, makeJson } from "../_shared/cors.ts";
import { basicAuth, verifyCheckoutSignature } from "../_shared/razorpay.ts";

declare const Deno: { env: { get: (name: string) => string | undefined } };

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
    const orderId = String(body?.razorpay_order_id ?? "");
    const paymentId = String(body?.razorpay_payment_id ?? "");
    const signature = String(body?.razorpay_signature ?? "");

    if (!(await verifyCheckoutSignature(orderId, paymentId, signature, keySecret))) {
      console.warn("[verify-razorpay-payment] bad signature", user.id);
      return json({ error: "Payment could not be verified", code: "signature" }, 400);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: row } = await admin.from("payments").select("customer_id, amount_paise, status")
      .eq("razorpay_order_id", orderId).maybeSingle();
    if (!row || row.customer_id !== user.id) return json({ error: "Payment not found", code: "not_found" }, 404);
    if (row.status === "paid") return json({ ok: true, status: "paid" });

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: basicAuth(keyId, keySecret) },
        signal: ctl.signal,
      });
    } catch {
      return json({ ok: false, status: "pending" });   // timeout / network: the webhook will settle it
    } finally { clearTimeout(timer); }
    if (!res.ok) return json({ ok: false, status: "pending" });   // webhook will settle it
    const p = await res.json();
    if (p.order_id !== orderId) return json({ error: "Payment mismatch", code: "signature" }, 400);
    if (p.status !== "captured") return json({ ok: false, status: "pending" });

    const { data, error } = await admin.rpc("record_payment_captured", {
      p_order_id: orderId, p_payment_id: paymentId, p_amount_paise: p.amount, p_method: p.method ?? null,
    });
    if (error) { console.error("[verify-razorpay-payment] rpc", error.message); return json({ ok: false, status: "pending" }); }
    if (data?.ok === false) {
      console.error("[verify-razorpay-payment] ALERT", data.reason, orderId, paymentId);
      return json({ error: "We received your payment but need to review it. Contact support.", code: "review" }, 409);
    }
    return json({ ok: true, status: "paid" });
  } catch (e) {
    console.error("[verify-razorpay-payment] unexpected", e);
    return json({ error: "Something went wrong. Please try again.", code: "unexpected" }, 500);
  }
});
