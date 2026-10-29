import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canPayOnline, onlinePaymentBlock, payableAmountPaise, paymentState, paymentStateLabel, PAYMENT_STATES } from "./payment";

describe("SQL booking_payable_paise follows the same rule (proposal 20261122000000)", () => {
  const sql = readFileSync(resolve(__dirname, "../../../../supabase/proposals/20261122000000_booking_payment_orders_PROPOSAL_NOT_APPLIED.sql"), "utf8");
  it("completed, unpaid, no extra waiting, total > 0, in paise", () => {
    expect(sql).toContain("IF b.status::text <> 'completed' THEN RETURN NULL;");
    expect(sql).toContain("IF COALESCE(b.payment_status, 'unpaid') <> 'unpaid' THEN RETURN NULL;");
    expect(sql).toContain("e.status = 'pending'");
    expect(sql).toContain("RETURN round(b.total_amount * 100)::bigint;");
  });
  it("allows the same payment states", () => {
    expect(sql).toContain(`payment_status IN (${PAYMENT_STATES.map((s) => `'${s}'`).join(", ")})`);
  });
});

const done = { status: "completed", payment_status: "unpaid", total_amount: 949 };

describe("paymentState", () => {
  it("accepts the five states and treats anything else as unpaid", () => {
    for (const s of PAYMENT_STATES) expect(paymentState(s)).toBe(s);
    for (const v of [null, undefined, "", "qr_open", 5]) expect(paymentState(v)).toBe("unpaid");
  });
  it("has a label for each state", () => {
    expect(PAYMENT_STATES.map(paymentStateLabel)).toEqual(["Not paid yet", "Payment being confirmed", "Paid", "Refunded", "Partly refunded"]);
  });
});

describe("payableAmountPaise", () => {
  it("is the customer total in paise (locked bill + approved extras, parts included)", () => {
    expect(payableAmountPaise({ total_amount: 949 })).toBe(94900);
    expect(payableAmountPaise({ total_amount: "133.00" })).toBe(13300);
    expect(payableAmountPaise({ total_amount: 349.5 })).toBe(34950);
  });
  it("rounds to whole paise", () => {
    expect(payableAmountPaise({ total_amount: 0.105 })).toBe(11); // 10.5 paise rounds up
    expect(payableAmountPaise({ total_amount: 199.999 })).toBe(20000);
  });
  it("is null for nothing to pay", () => {
    for (const v of [0, -5, null, "abc", Number.NaN]) expect(payableAmountPaise({ total_amount: v as number })).toBeNull();
  });
});

describe("onlinePaymentBlock / canPayOnline (owner: pay once the job is completed)", () => {
  it("allows a completed, unpaid booking with an amount", () => {
    expect(onlinePaymentBlock(done)).toBeNull();
    expect(canPayOnline({ ...done, payment_status: null })).toBe(true);
  });
  it.each(["pending", "confirmed", "on_the_way", "arrived", "in_progress"])("waits while the job is %s (bill not final)", (status) => {
    expect(onlinePaymentBlock({ ...done, status })).toBe("not_finished");
  });
  it("never for a cancelled booking", () => {
    expect(onlinePaymentBlock({ ...done, status: "cancelled" })).toBe("cancelled");
  });
  it("not again once paid, while a payment is being confirmed, or after a refund", () => {
    expect(onlinePaymentBlock({ ...done, payment_status: "paid" })).toBe("already_paid");
    expect(onlinePaymentBlock({ ...done, payment_status: "pending" })).toBe("payment_pending");
    expect(onlinePaymentBlock({ ...done, payment_status: "refunded" })).toBe("refunded");
    expect(onlinePaymentBlock({ ...done, payment_status: "partially_refunded" })).toBe("refunded");
  });
  it("not while an extra waits for approval, nor without an amount", () => {
    expect(onlinePaymentBlock(done, 1)).toBe("extra_waiting");
    expect(onlinePaymentBlock({ ...done, total_amount: 0 })).toBe("no_amount");
    expect(canPayOnline(done, 1)).toBe(false);
  });
});
