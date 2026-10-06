// Edge Function: razorpay-webhook
// Razorpay -> us. This is the source of truth for "the customer paid". The browser callback is only a
// shortcut; if the customer closes the tab right after paying, THIS is what marks the booking paid.
//
// Deploy (JWT check must be OFF, Razorpay does not send a Supabase JWT; the HMAC signature is the auth):
//   supabase functions deploy razorpay-webhook --no-verify-jwt
// Secrets: RAZORPAY_WEBHOOK_SECRET (the secret you type into the Razorpay dashboard webhook form)
// Dashboard events to tick: payment.captured, payment.failed, order.paid, refund.processed
//
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyWebhookSignature } from "../_shared/razorpay.ts";
import { handleWebhookEvent } from "./core.ts";
import type { Rpc } from "./core.ts";

declare const Deno: { env: { get: (name: string) => string | undefined } };

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method" });

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !serviceKey) {
    console.error("[razorpay-webhook] not configured");
    return reply(500, { error: "config" });
  }

  // Signature is computed over the RAW body: read text first, parse after.
  const raw = await req.text();
  if (!(await verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"), secret))) {
    console.warn("[razorpay-webhook] bad signature");
    return reply(401, { error: "signature" });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return reply(400, { error: "json" }); }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc: Rpc = async (fn, args) => {
    const { data, error } = await admin.rpc(fn, args);
    return { data: (data ?? null) as Record<string, unknown> | null, error: error ? { message: error.message } : null };
  };

  try {
    const out = await handleWebhookEvent(evt, rpc);
    if (out.kind === "retry") {
      console.error("[razorpay-webhook] transient failure, asking Razorpay to retry", out.event, out.message);
      return reply(500, { error: "retry" });
    }
    if (out.kind === "alert") {
      // Needs a human (amount mismatch, double payment...). 200 so Razorpay stops retrying; grep logs for ALERT.
      console.error("[razorpay-webhook] ALERT", out.event, out.reason, raw.slice(0, 500));
    }
    const eventId = req.headers.get("x-razorpay-event-id");
    if (eventId) {
      await admin.from("razorpay_events").upsert({ event_id: eventId, event: out.event }, { onConflict: "event_id", ignoreDuplicates: true });
    }
    return reply(200, { ok: true });
  } catch (e) {
    console.error("[razorpay-webhook] unexpected", e);
    return reply(500, { error: "unexpected" });
  }
});
