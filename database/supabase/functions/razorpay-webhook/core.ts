// Webhook event routing. Pure: the database calls are injected, so this is unit tested in vitest.
// Every RPC is idempotent, so Razorpay re-delivering an event (it retries for 24h) is harmless.

export type RpcResult = { data: Record<string, unknown> | null; error: { message: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;

type Entity = Record<string, unknown>;
type Event = { event?: string; payload?: Record<string, { entity?: Entity } | undefined> };

export type Outcome =
  | { kind: "ignored"; event: string }
  | { kind: "ok"; event: string; result: Record<string, unknown> }
  | { kind: "alert"; event: string; reason: string }   // needs a human; do NOT make Razorpay retry
  | { kind: "retry"; event: string; message: string };  // transient: answer 5xx so Razorpay retries

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

export async function handleWebhookEvent(evt: Event, rpc: Rpc): Promise<Outcome> {
  const name = str(evt.event);
  const pay = evt.payload?.payment?.entity ?? {};
  const order = evt.payload?.order?.entity ?? {};
  const refund = evt.payload?.refund?.entity ?? {};

  const call = async (fn: string, args: Record<string, unknown>): Promise<Outcome> => {
    const { data, error } = await rpc(fn, args);
    if (error) return { kind: "retry", event: name, message: error.message };
    if (data && data.ok === false) return { kind: "alert", event: name, reason: str(data.reason) || "rejected" };
    return { kind: "ok", event: name, result: data ?? {} };
  };

  if (name === "payment.captured" || name === "order.paid") {
    const orderId = str(pay.order_id) || str(order.id);
    const paymentId = str(pay.id);
    const amount = num(pay.amount);
    if (!orderId || !paymentId || Number.isNaN(amount)) return { kind: "alert", event: name, reason: "malformed_payload" };
    return call("record_payment_captured", {
      p_order_id: orderId, p_payment_id: paymentId, p_amount_paise: amount, p_method: str(pay.method) || null,
    });
  }

  if (name === "payment.failed") {
    const orderId = str(pay.order_id);
    if (!orderId) return { kind: "ignored", event: name };
    const reason = str(pay.error_description) || str(pay.error_reason) || "failed";
    const { error } = await rpc("record_payment_failed", { p_order_id: orderId, p_reason: reason });
    return error ? { kind: "retry", event: name, message: error.message } : { kind: "ok", event: name, result: {} };
  }

  if (name === "refund.processed") {
    const paymentId = str(refund.payment_id);
    const amount = num(refund.amount);
    if (!paymentId || Number.isNaN(amount)) return { kind: "alert", event: name, reason: "malformed_payload" };
    const out = await call("record_payment_refunded", { p_payment_id: paymentId, p_refund_paise: amount });
    if (out.kind === "ok" && out.result.needs_manual_review === true) {
      return { kind: "alert", event: name, reason: "refund_after_payout_requested" };
    }
    return out;
  }

  return { kind: "ignored", event: name };
}
