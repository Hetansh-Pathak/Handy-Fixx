// DEPLOYABLE COPY of supabase/proposals/functions/razorpay-webhook (Payments Section 2, 2026-10-30). NOT deployed yet:
// the live version is the Section 0 one (v10, wallet top-ups only). Keep both copies identical below this header.
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get: (name: string) => string | undefined } };

// Originally: Payments Section 2 version (2026-10-30). Live today: the Section 0 version (wallet top-ups).
// Deploy AFTER proposals 20261122000000 and 20261123000000 are applied:
//   npx supabase functions deploy razorpay-webhook --no-verify-jwt --project-ref jviwwhjwtyneqrguumro
// (Razorpay does not send a Supabase login. Security = the HMAC signature below, unchanged.)
//
// Routing by notes.type (order notes, else payment notes):
//   wallet_topup     -> record_wallet_topup (unchanged)
//   booking_payment  -> record_booking_payment (credits the pro once per payment, only when the amount matches)
//   (no notes)       -> top-up first; if it is not a top-up order, the booking payment
//   anything else    -> logged and ignored
// payment.failed   -> mark_booking_payment_failed (no money moves) + logged
// refund.processed -> record_booking_refund; if it is not a booking payment, record_refund (wallet top-ups, QR) as
//                     before. A booking refund that arrives before its capture is recorded gets a 500, so Razorpay
//                     retries it later. Duplicate events are safe: every money write is idempotent in the database.
// Events to enable in the Razorpay dashboard: payment.captured, order.paid, payment.failed, refund.processed.

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function validSignature(raw: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

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

/** The parts of a Razorpay payment entity this function reads. */
type RzpPayment = { id: string; order_id?: string; amount: number; method?: string; notes?: { type?: string }; error_description?: string };

/** The SQL function is not in the database yet (proposal not applied). */
const missingFunction = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST202" || /could not find the function/i.test(e.message ?? ""));

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !serviceKey) return new Response("not configured", { status: 500 });

  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-razorpay-signature"), secret))) {
    return new Response("invalid signature", { status: 401 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const eventId = req.headers.get("x-razorpay-event-id");

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const log = async (row: Record<string, unknown>) => {
    try {
      await admin.from("payment_events").upsert(
        { event_id: eventId, event_type: event?.event ?? "unknown", payload: event, ...row },
        { onConflict: "event_id", ignoreDuplicates: true },
      );
    } catch (e) { console.warn("log failed", e); }
  };

  /** Pro recharged the wallet. Returns the database's result ("unknown_order" = not a top-up order). */
  const walletTopup = async (payment: RzpPayment, quiet: boolean) => {
    const { data, error } = await admin.rpc("record_wallet_topup", {
      p_order_id: payment.order_id,
      p_payment_id: payment.id,
      p_amount_paise: payment.amount,
    });
    if (error) throw error;
    const result: string = data?.result ?? "unknown";
    if (!(quiet && result === "unknown_order")) {
      await log({ result, provider_id: data?.provider_id ?? null, razorpay_payment_id: payment.id, amount: payment.amount / 100,
                  note: result === "amount_mismatch" ? `Top-up amount mismatch: expected ${data?.expected}, received ${data?.received}` : null });
    }
    return result;
  };

  /** Customer paid a booking in the app. The database credits the pro once and only for the exact order amount. */
  const bookingPayment = async (payment: RzpPayment, quiet: boolean) => {
    const { data, error } = await admin.rpc("record_booking_payment", {
      p_order_id: payment.order_id,
      p_payment_id: payment.id,
      p_amount_paise: payment.amount,
      p_method: payment.method ?? null,
    });
    if (error) {
      if (quiet && missingFunction(error)) return "unknown_order";
      throw error; // 500: Razorpay retries (e.g. until 20261123000000 is applied)
    }
    const result: string = data?.result ?? "unknown";
    if (quiet && result === "unknown_order") return result;
    const note =
      result === "amount_mismatch" ? `Booking payment amount mismatch: expected ${data?.expected} paise, received ${data?.received}. NOT credited.`
      : result === "booking_already_paid" || result === "order_already_paid" ? "This booking was already paid: NOT credited. Refund this payment in the Razorpay dashboard."
      : null;
    await log({ result, booking_id: data?.booking_id ?? null, provider_id: data?.provider_id ?? null,
                razorpay_payment_id: payment.id, amount: payment.amount / 100, note });
    return result;
  };

  try {
    const type: string = event?.event ?? "";
    const payment = event?.payload?.payment?.entity;

    // ── Customer paid a booking QR (old flow, unchanged) ─────────────────────
    if (type === "qr_code.credited" && payment) {
      const qr = event?.payload?.qr_code?.entity;
      const { data, error } = await admin.rpc("record_qr_payment", {
        p_qr_id: qr?.id ?? payment?.qr_code_id ?? null,
        p_booking_id: qr?.notes?.booking_id ?? null,
        p_payment_id: payment.id,
        p_amount_paise: payment.amount,
      });
      if (error) throw error;
      let result: string = data?.result ?? "unknown";
      let note: string | null = null;

      // Customer paid by QR after the provider already took cash (or paid twice): refund automatically.
      if (result === "already_paid") {
        try {
          await razorpay(`/payments/${payment.id}/refund`, "POST", {
            notes: { reason: "duplicate_payment", booking_id: data?.booking_id ?? "" },
          });
          result = "duplicate_refunded";
          note = "Customer paid again after the booking was already paid. Full refund requested automatically.";
        } catch (e) {
          result = "refund_failed";
          note = `Duplicate payment could NOT be refunded automatically: ${e instanceof Error ? e.message : e}. Refund it manually in Razorpay.`;
        }
      } else if (result === "amount_mismatch") {
        note = `Amount mismatch: expected ${data?.expected}, received ${data?.received}. Check in Razorpay.`;
      } else if (result === "unknown_qr") {
        note = "Payment received on a QR that is not linked to any booking. Check in Razorpay.";
      }
      await log({ result, booking_id: data?.booking_id ?? qr?.notes?.booking_id ?? null, provider_id: data?.provider_id ?? null,
                  razorpay_payment_id: payment.id, amount: payment.amount / 100, note });
      return Response.json({ ok: true, result });
    }

    // ── A Checkout payment succeeded (order.paid may arrive before or after payment.captured) ──
    if ((type === "payment.captured" || type === "order.paid") && payment?.order_id) {
      const noteType: string | null = event?.payload?.order?.entity?.notes?.type ?? payment?.notes?.type ?? null;
      let result: string;
      if (noteType === "booking_payment") result = await bookingPayment(payment, false);
      else if (noteType === "wallet_topup") result = await walletTopup(payment, false);
      else if (!noteType) {
        result = await walletTopup(payment, true);
        if (result === "unknown_order") result = await bookingPayment(payment, true);
        if (result === "unknown_order") await log({ result: "ignored", razorpay_payment_id: payment.id, amount: payment.amount / 100, note: "Not a wallet top-up or booking order" });
      } else {
        result = "ignored";
        await log({ result, razorpay_payment_id: payment.id, amount: payment.amount / 100, note: `notes.type ${noteType} is not handled` });
      }
      return Response.json({ ok: true, result });
    }

    // ── A payment attempt failed: no money moves; the order can still be paid by a later attempt ──
    if (type === "payment.failed") {
      let result = "logged";
      if (payment?.order_id) {
        const { data, error } = await admin.rpc("mark_booking_payment_failed", { p_order_id: payment.order_id });
        if (!error) result = data?.result ?? result;
      }
      await log({ result, booking_id: null, razorpay_payment_id: payment?.id ?? null, amount: payment ? payment.amount / 100 : null,
                  note: `payment.failed${payment?.error_description ? `: ${payment.error_description}` : ""}` });
      return Response.json({ ok: true, result });
    }

    // ── A refund was processed ──────────────────────────────────────────────
    if (type === "refund.processed") {
      const refund = event?.payload?.refund?.entity;
      if (refund?.payment_id && refund?.id) {
        const args = { p_payment_id: refund.payment_id, p_refund_id: refund.id, p_amount_paise: refund.amount };
        const booking = await admin.rpc("record_booking_refund", args);
        if (booking.error && !missingFunction(booking.error)) throw booking.error;
        let data = booking.error ? null : booking.data;
        let result: string = data?.result ?? "unknown_payment";
        if (result === "unknown_payment") {
          // Not a recorded booking payment: wallet top-up or QR refund, as before.
          const wallet = await admin.rpc("record_refund", args);
          if (wallet.error) throw wallet.error;
          data = wallet.data;
          result = data?.result ?? "unknown";
          if (result === "no_credit") {
            // Out of order: a booking payment whose capture is not recorded yet. 500 = Razorpay retries later.
            try {
              const p = await razorpay(`/payments/${refund.payment_id}`, "GET");
              const o = p?.order_id ? await razorpay(`/orders/${p.order_id}`, "GET") : null;
              if (o?.notes?.type === "booking_payment") return new Response("capture not recorded yet", { status: 500 });
            } catch (e) { console.warn("refund lookup failed", e); }
          }
        }
        await log({ result, booking_id: data?.booking_id ?? null, provider_id: data?.provider_id ?? null,
                    razorpay_payment_id: refund.payment_id, amount: refund.amount / 100 });
        return Response.json({ ok: true, result });
      }
    }

    await log({ result: "ignored", razorpay_payment_id: payment?.id ?? null, amount: payment ? payment.amount / 100 : null, note: `event ${type}` });
    return Response.json({ ok: true, result: "ignored" });
  } catch (e) {
    // 500 makes Razorpay retry later. Every money write is idempotent, so retries are safe.
    console.error("razorpay-webhook error:", e);
    return new Response("error", { status: 500 });
  }
});
