import { describe, expect, it } from "vitest";
import { handleWebhookEvent, type Rpc } from "../../../database/supabase/functions/razorpay-webhook/core";

const recorder = (reply: Record<string, unknown> | { error: string } = { ok: true }) => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    if ("error" in reply) return { data: null, error: { message: String(reply.error) } };
    return { data: reply, error: null };
  };
  return { calls, rpc };
};

const captured = (over: Record<string, unknown> = {}) => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 44800, method: "upi", ...over } } },
});

describe("razorpay webhook routing", () => {
  it("marks a captured payment paid with the amount Razorpay reports", async () => {
    const { calls, rpc } = recorder();
    const out = await handleWebhookEvent(captured(), rpc);
    expect(out.kind).toBe("ok");
    expect(calls).toEqual([{ fn: "record_payment_captured", args: { p_order_id: "order_1", p_payment_id: "pay_1", p_amount_paise: 44800, p_method: "upi" } }]);
  });

  it("treats order.paid the same way (order id may sit on the order entity)", async () => {
    const { calls, rpc } = recorder();
    await handleWebhookEvent({ event: "order.paid", payload: { order: { entity: { id: "order_1" } }, payment: { entity: { id: "pay_1", amount: 44800 } } } }, rpc);
    expect(calls[0].args.p_order_id).toBe("order_1");
  });

  it("asks Razorpay to retry when the database call fails", async () => {
    const out = await handleWebhookEvent(captured(), recorder({ error: "db down" }).rpc);
    expect(out).toMatchObject({ kind: "retry" });
  });

  it("raises an alert (no retry) when the database rejects the payment", async () => {
    for (const reason of ["amount_mismatch", "double_payment", "unknown_order"]) {
      const out = await handleWebhookEvent(captured(), recorder({ ok: false, reason }).rpc);
      expect(out).toMatchObject({ kind: "alert", reason });
    }
  });

  it("treats a replayed event as success", async () => {
    const out = await handleWebhookEvent(captured(), recorder({ ok: true, duplicate: true }).rpc);
    expect(out.kind).toBe("ok");
  });

  it("does not call the database for a malformed capture", async () => {
    const { calls, rpc } = recorder();
    const out = await handleWebhookEvent(captured({ amount: "44800" }), rpc);
    expect(out).toMatchObject({ kind: "alert", reason: "malformed_payload" });
    expect(calls).toHaveLength(0);
  });

  it("records a failed attempt without closing the order", async () => {
    const { calls, rpc } = recorder();
    const out = await handleWebhookEvent({ event: "payment.failed", payload: { payment: { entity: { order_id: "order_1", error_description: "Insufficient funds" } } } }, rpc);
    expect(out.kind).toBe("ok");
    expect(calls[0]).toEqual({ fn: "record_payment_failed", args: { p_order_id: "order_1", p_reason: "Insufficient funds" } });
  });

  it("flags a refund that arrives after the provider already requested a payout", async () => {
    const evt = { event: "refund.processed", payload: { refund: { entity: { payment_id: "pay_1", amount: 44800 } } } };
    expect(await handleWebhookEvent(evt, recorder({ ok: true }).rpc)).toMatchObject({ kind: "ok" });
    expect(await handleWebhookEvent(evt, recorder({ ok: true, needs_manual_review: true }).rpc)).toMatchObject({ kind: "alert", reason: "refund_after_payout_requested" });
  });

  it("ignores events it does not use", async () => {
    const { calls, rpc } = recorder();
    expect(await handleWebhookEvent({ event: "payment.authorized" }, rpc)).toMatchObject({ kind: "ignored" });
    expect(await handleWebhookEvent({}, rpc)).toMatchObject({ kind: "ignored" });
    expect(calls).toHaveLength(0);
  });
});
