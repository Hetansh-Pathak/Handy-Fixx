import { describe, expect, it } from "vitest";
import { checkoutFailure, findNewTopup, rechargeStartError } from "./recharge";
import type { LedgerEntry } from "./wallet-ledger";

const row = (id: string, type: string, amount: number | string): LedgerEntry => ({ id, type, amount, created_at: "2026-10-30T10:00:00Z" });

describe("findNewTopup", () => {
  const before = Array.from({ length: 40 }, (_, i) => row(`old${i}`, "cash_fee", -15));
  const beforeIds = new Set(before.map((e) => e.id));

  it("finds the new top-up even when the capped list stays at 40 rows (the old length check missed it)", () => {
    const after = [row("new", "topup", "99.00"), ...before.slice(0, 39)];
    expect(after.length).toBe(before.length);
    expect(findNewTopup(beforeIds, after, 99)?.id).toBe("new");
  });
  it("ignores old rows, other types and other amounts", () => {
    expect(findNewTopup(beforeIds, before, 99)).toBeNull();
    expect(findNewTopup(beforeIds, [row("fee", "cash_fee", -12), ...before], 99)).toBeNull();
    expect(findNewTopup(beforeIds, [row("other", "topup", 49), ...before], 99)).toBeNull();
    expect(findNewTopup(new Set(["t"]), [row("t", "topup", 99)], 99)).toBeNull();
  });
});

describe("checkoutFailure", () => {
  it("treats a closed sheet as cancelled, not an error", () => {
    expect(checkoutFailure({ code: 0, description: "Payment Cancelled" })).toEqual({ status: "cancelled" });
    expect(checkoutFailure({ code: "0" })).toEqual({ status: "cancelled" });
    expect(checkoutFailure({ code: 2, description: '{"error":{"code":"BAD_REQUEST_ERROR","description":"Payment processing cancelled by user"}}' }))
      .toEqual({ status: "cancelled" });
  });
  it("never shows raw JSON: reads Razorpay's description out of the Android JSON string", () => {
    const err = { code: 4, description: '{"error":{"code":"BAD_REQUEST_ERROR","description":"Your payment has been declined by your bank","source":"bank","reason":"payment_failed"}}' };
    expect(checkoutFailure(err)).toEqual({ status: "failed", message: "Your payment has been declined by your bank. Nothing was charged." });
  });
  it("falls back to the reason, then to a plain sentence", () => {
    expect(checkoutFailure({ code: 4, description: '{"error":{"reason":"payment_failed"}}' })).toEqual({ status: "failed", message: "payment failed. Nothing was charged." });
    expect(checkoutFailure({ code: 4, description: "{not json" })).toEqual({ status: "failed", message: "The payment did not go through. You were not charged." });
    expect(checkoutFailure(undefined)).toEqual({ status: "failed", message: "The payment did not go through. You were not charged." });
  });
  it("words network and setup errors plainly", () => {
    expect(checkoutFailure({ code: 1, description: "Network error" })).toMatchObject({ message: expect.stringContaining("No internet") });
    expect(checkoutFailure({ code: 2, description: "Invalid options" })).toMatchObject({ message: expect.stringContaining("could not start") });
  });
  it("keeps the iOS / object form working", () => {
    expect(checkoutFailure({ code: 4, error: { description: "Card expired" } })).toEqual({ status: "failed", message: "Card expired. Nothing was charged." });
  });
});

describe("rechargeStartError", () => {
  it("replaces transport errors with a plain sentence", () => {
    expect(rechargeStartError(new Error("Failed to send a request to the Edge Function"))).toBe("No connection. Check your internet and try again. Nothing was charged.");
    expect(rechargeStartError(new Error("Network request failed"))).toContain("No connection");
    expect(rechargeStartError(new Error("Edge Function returned a non-2xx status code"))).toBe("Could not start the payment. Please try again in a minute.");
  });
  it("passes the server's own messages through", () => {
    expect(rechargeStartError(new Error("Too many payment attempts. Wait a few minutes and try again."))).toBe("Too many payment attempts. Wait a few minutes and try again.");
    expect(rechargeStartError(new Error("Pick a recharge pack: ₹49, ₹99, ₹199."))).toBe("Pick a recharge pack: ₹49, ₹99, ₹199.");
  });
  it("has a fallback for anything else", () => {
    expect(rechargeStartError("boom")).toBe("Could not start the payment. Please try again.");
  });
});
