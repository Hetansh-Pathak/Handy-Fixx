import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bookingPaymentLedger, bookingRefundReversal, EARNING_HOLD_HOURS, onHoldTotal } from "./payment-ledger";

const job = { amountPaidPaise: 94900, providerAmount: 949, partsAmount: 0, launchActive: false, feeAlreadySettled: false };

describe("bookingPaymentLedger", () => {
  it("credits everything the customer paid and takes the 3% fee from the payment", () => {
    expect(bookingPaymentLedger(job)).toEqual({ earning: 949, fee: 28, feeForJob: 28, feeWaived: false, releaseHold: 0, net: 921 });
  });
  it("excludes parts from the fee, but the pro still receives them", () => {
    const l = bookingPaymentLedger({ ...job, amountPaidPaise: 133000, providerAmount: 1330, partsAmount: 330 });
    expect(l).toMatchObject({ earning: 1330, fee: 30, net: 1300 }); // 3% of ₹1,000
  });
  it("approved extras that raise the bill raise the fee (and the cap still applies)", () => {
    expect(bookingPaymentLedger({ ...job, amountPaidPaise: 40000, providerAmount: 400 }).fee).toBe(12);
    expect(bookingPaymentLedger({ ...job, amountPaidPaise: 150000, providerAmount: 1500 }).fee).toBe(45);
    expect(bookingPaymentLedger({ ...job, amountPaidPaise: 500000, providerAmount: 5000 }).fee).toBe(50);
  });
  it("waives the fee in the launch period but keeps the figure for display", () => {
    expect(bookingPaymentLedger({ ...job, launchActive: true })).toEqual({ earning: 949, fee: 0, feeForJob: 28, feeWaived: true, releaseHold: 0, net: 949 });
  });
  it("never charges the fee twice: completion already settled it", () => {
    expect(bookingPaymentLedger({ ...job, feeAlreadySettled: true, heldFee: 28 })).toMatchObject({ fee: 0, releaseHold: 0, net: 949 });
  });
  it("releases a fee still held for this booking (the fee now comes from the payment)", () => {
    expect(bookingPaymentLedger({ ...job, heldFee: 28 })).toMatchObject({ fee: 28, releaseHold: 28 });
  });
});

describe("bookingRefundReversal", () => {
  const base = { paidPaise: 94900, refundedBeforePaise: 0, earningCredited: 949, feeCharged: 28, feeReturnedBefore: 0 };
  it("full refund: takes back the earning and returns the fee (net earning minus fee)", () => {
    expect(bookingRefundReversal({ ...base, refundPaise: 94900 })).toMatchObject({ earningReversed: 949, feeReturned: 28, net: 921, fullyRefunded: true });
  });
  it("partial refund is pro-rata", () => {
    const r = bookingRefundReversal({ ...base, refundPaise: 47450 });
    expect(r).toMatchObject({ fraction: 0.5, earningReversed: 474.5, feeReturned: 14, net: 460.5, fullyRefunded: false });
  });
  it("a second partial refund finishes it; a refund cannot exceed what is left", () => {
    const r = bookingRefundReversal({ ...base, refundedBeforePaise: 47450, feeReturnedBefore: 14, refundPaise: 99999 });
    expect(r).toMatchObject({ appliedPaise: 47450, earningReversed: 474.5, feeReturned: 14, net: 460.5, fullyRefunded: true });
    expect(bookingRefundReversal({ ...base, refundedBeforePaise: 94900, refundPaise: 100 })).toMatchObject({ appliedPaise: 0, net: 0 });
  });
  it("never returns a fee twice (a dispute decision already returned it)", () => {
    expect(bookingRefundReversal({ ...base, feeReturnedBefore: 28, refundPaise: 94900 })).toMatchObject({ feeReturned: 0, net: 949 });
  });
  it("launch job (no fee charged): only the earning is taken back", () => {
    expect(bookingRefundReversal({ ...base, feeCharged: 0, refundPaise: 94900 })).toMatchObject({ feeReturned: 0, net: 949 });
  });
  it("a payment that was never credited (booking already paid another way) moves no money", () => {
    expect(bookingRefundReversal({ ...base, earningCredited: 0, refundPaise: 94900 })).toMatchObject({ net: 0, feeReturned: 0 });
  });
});

describe("onHoldTotal", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const future = "2026-11-01T12:00:00Z";
  it("counts online earnings not yet available, minus refunds of the same payment", () => {
    const rows = [
      { type: "online_credit", amount: 949, available_at: future, razorpay_payment_id: "pay_1" },
      { type: "online_credit", amount: 500, available_at: "2026-10-29T12:00:00Z", razorpay_payment_id: "pay_2" },
      { type: "refund_reversal", amount: -460.5, razorpay_payment_id: "pay_1" },
      { type: "topup", amount: 99 },
    ];
    expect(onHoldTotal(rows, now)).toBe(488.5);
  });
  it("a fully refunded payment is not on hold any more", () => {
    expect(onHoldTotal([{ type: "online_credit", amount: 949, available_at: future, razorpay_payment_id: "p" }, { type: "refund_reversal", amount: -949, razorpay_payment_id: "p" }], now)).toBe(0);
  });
});

describe("SQL follows the same rules (proposal 20261123000000)", () => {
  const sql = readFileSync(resolve(__dirname, "../../../../supabase/proposals/20261123000000_booking_payment_settlement_PROPOSAL_NOT_APPLIED.sql"), "utf8");
  it("holds earnings for the same default time", () => {
    expect(sql).toContain(`earning_hold_hours integer NOT NULL DEFAULT ${EARNING_HOLD_HOURS}`);
  });
  it("fee base excludes parts and is skipped when completion already settled it", () => {
    expect(sql).toContain("GREATEST(0, COALESCE(b.provider_amount, 0) - COALESCE(b.parts_amount, 0))");
    expect(sql).toContain("IF NOT EXISTS (SELECT 1 FROM public.booking_fees WHERE booking_id = b.id)");
  });
  it("refund: earning minus fee, pro-rata, fee never returned twice", () => {
    expect(sql).toContain("v_fee_ret := LEAST(round(COALESCE(f.charged, 0) * v_frac, 2), GREATEST(0, COALESCE(f.charged, 0) - COALESCE(f.refunded, 0)));");
    expect(sql).toContain("v_net := v_earn_rev - v_fee_ret;");
  });
});
