// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get: (name: string) => string | undefined } };

// Deploy with:  supabase functions deploy razorpay-webhook --no-verify-jwt
// (Razorpay does not send a Supabase login. Security = the HMAC signature below.)

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

  try {
    const type: string = event?.event ?? "";
    const payment = event?.payload?.payment?.entity;

    // ── Customer paid a booking QR ───────────────────────────────────────────
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

    // ── Provider paid dues (Razorpay Checkout order) ─────────────────────────
    if ((type === "payment.captured" || type === "order.paid") && payment?.order_id) {
      const { data, error } = await admin.rpc("record_wallet_topup", {
        p_order_id: payment.order_id,
        p_payment_id: payment.id,
        p_amount_paise: payment.amount,
      });
      if (error) throw error;
      const result: string = data?.result ?? "unknown";
      // unknown_order = a payment that is not one of our top-ups (ignore quietly)
      if (result !== "unknown_order") {
        await log({ result, provider_id: data?.provider_id ?? null, razorpay_payment_id: payment.id, amount: payment.amount / 100,
                    note: result === "amount_mismatch" ? `Top-up amount mismatch: expected ${data?.expected}, received ${data?.received}` : null });
      }
      return Response.json({ ok: true, result });
    }

    // ── A refund was processed: reverse the provider credit ──────────────────
    if (type === "refund.processed") {
      const refund = event?.payload?.refund?.entity;
      if (refund?.payment_id && refund?.id) {
        const { data, error } = await admin.rpc("record_refund", {
          p_payment_id: refund.payment_id,
          p_refund_id: refund.id,
          p_amount_paise: refund.amount,
        });
        if (error) throw error;
        await log({ result: data?.result ?? "unknown", provider_id: data?.provider_id ?? null,
                    razorpay_payment_id: refund.payment_id, amount: refund.amount / 100 });
        return Response.json({ ok: true, result: data?.result });
      }
    }

    if (type === "payment.failed") {
      await log({ result: "ignored", razorpay_payment_id: payment?.id ?? null, amount: payment ? payment.amount / 100 : null, note: "payment.failed" });
    }
    return Response.json({ ok: true, result: "ignored" });
  } catch (e) {
    // 500 makes Razorpay retry later. Every money write is idempotent, so retries are safe.
    console.error("razorpay-webhook error:", e);
    return new Response("error", { status: 500 });
  }
});
