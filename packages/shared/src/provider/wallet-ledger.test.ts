import { describe, expect, it } from "vitest";
import { describeLedgerEntry, earningsSummary, indiaDay, interpretPayout, payoutErrorMessage } from "./wallet-ledger";

describe("indiaDay", () => {
  it("converts to the calendar day in India (UTC+5:30)", () => {
    expect(indiaDay("2026-10-28T20:45:04Z")).toBe("2026-10-29");
    expect(indiaDay("2026-10-28T18:29:59Z")).toBe("2026-10-28");
    expect(indiaDay("2026-10-28T18:30:00Z")).toBe("2026-10-29");
    expect(indiaDay(new Date("2026-10-28T10:00:00Z"))).toBe("2026-10-28");
  });
  it("is null for a missing or bad value", () => {
    expect(indiaDay(null)).toBeNull();
    expect(indiaDay("not a date")).toBeNull();
  });
});

describe("describeLedgerEntry", () => {
  it("shows a fee as a red minus with a readable label", () => {
    const l = describeLedgerEntry({ id: "1", type: "cash_fee", amount: "-15.00", created_at: "2026-10-01T00:00:00Z", note: " Job fee " });
    expect(l).toMatchObject({ label: "HandyFix fee", credit: false, amountText: "-₹15", note: "Job fee" });
  });
  it("shows a top-up as a plus", () => {
    expect(describeLedgerEntry({ id: "2", type: "topup", amount: 500, created_at: "x" })).toMatchObject({ label: "Wallet top-up", credit: true, amountText: "+₹500", note: null });
  });
  it("copes with an unknown type and a bad amount", () => {
    expect(describeLedgerEntry({ id: "3", type: "mystery", amount: "oops", created_at: "x" })).toMatchObject({ label: "Wallet entry", amount: 0, credit: false });
  });
});

describe("payout replies", () => {
  it("maps every reason", () => {
    for (const r of ["invalid_amount", "not_approved", "no_payout_details", "below_minimum", "insufficient_balance", "other"]) expect(payoutErrorMessage(r, 200).length).toBeGreaterThan(5);
    expect(payoutErrorMessage("below_minimum", 200)).toBe("The minimum withdrawal is ₹200.");
    expect(payoutErrorMessage("below_minimum")).toContain("₹0");
  });
  it("interprets success and failure", () => {
    expect(interpretPayout({ ok: true, amount: "250.00" })).toEqual({ ok: true, amount: 250 });
    expect(interpretPayout({ ok: false, reason: "below_minimum", min_payout: 200 })).toEqual({ ok: false, message: "The minimum withdrawal is ₹200." });
    expect(interpretPayout(null)).toEqual({ ok: false, message: "Could not request the withdrawal. Try again." });
    expect(interpretPayout({ ok: true })).toEqual({ ok: true, amount: 0 });
  });
});

describe("describeLedgerEntry: online booking earnings", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  it("labels them 'Paid online' and shows the hold until the dispute window ends", () => {
    const l = describeLedgerEntry({ id: "o", type: "online_credit", amount: "949.00", created_at: "x", available_at: "2026-11-01T12:00:00Z" }, now);
    expect(l).toMatchObject({ label: "Paid online", credit: true, amountText: "+₹949", onHoldUntil: "2026-11-01T12:00:00Z" });
  });
  it("is not on hold once the time has passed, nor for rows without a hold", () => {
    expect(describeLedgerEntry({ id: "o", type: "online_credit", amount: 949, created_at: "x", available_at: "2026-10-29T12:00:00Z" }, now).onHoldUntil).toBeNull();
    expect(describeLedgerEntry({ id: "t", type: "topup", amount: 99, created_at: "x" }, now).onHoldUntil).toBeNull();
    expect(describeLedgerEntry({ id: "r", type: "refund_reversal", amount: -921, created_at: "x", available_at: "2026-11-01T12:00:00Z" }, now).onHoldUntil).toBeNull();
  });
});

describe("earningsSummary", () => {
  const now = new Date("2026-10-27T10:00:00Z");
  it("counts completed jobs only, split by today and month", () => {
    const s = earningsSummary([
      { status: "completed", provider_amount: 300, booking_date: "2026-10-27" },
      { status: "completed", provider_amount: "200", booking_date: "2026-10-03" },
      { status: "completed", provider_amount: 100, booking_date: "2026-09-30" },
      { status: "completed", provider_amount: null, created_at: "2026-10-27T01:00:00Z" },
      { status: "cancelled", provider_amount: 999, booking_date: "2026-10-27" },
    ], now);
    expect(s).toEqual({ jobs: 4, total: 600, monthJobs: 3, monthTotal: 500, todayTotal: 300 });
  });
  it("counts a job on the India-time day it was completed (the 2 AM case that showed ₹0)", () => {
    // Completed 02:15 IST on 29 Oct = 20:45 UTC on 28 Oct; booked for 29 Oct; viewed at 03:57 IST on 29 Oct.
    const job = { status: "completed", provider_amount: "949.00", booking_date: "2026-10-29", completed_at: "2026-10-28T20:45:04Z" };
    expect(earningsSummary([job], new Date("2026-10-28T22:27:46Z"))).toMatchObject({ todayTotal: 949, monthTotal: 949, monthJobs: 1 });
  });
  it("uses the completion day, not the booked day", () => {
    const job = { status: "completed", provider_amount: 500, booking_date: "2026-10-30", completed_at: "2026-10-27T06:00:00Z" };
    expect(earningsSummary([job], now).todayTotal).toBe(500);
    expect(earningsSummary([job], new Date("2026-10-30T06:00:00Z")).todayTotal).toBe(0);
  });
  it("rolls 'today' and 'this month' over at India midnight, not UTC midnight", () => {
    const job = { status: "completed", provider_amount: 200, completed_at: "2026-10-31T19:00:00Z" }; // 1 Nov 00:30 IST
    const s = earningsSummary([job], new Date("2026-10-31T20:00:00Z")); // 1 Nov 01:30 IST
    expect(s).toMatchObject({ todayTotal: 200, monthJobs: 1 });
  });
  it("handles a booking with no date", () => {
    expect(earningsSummary([{ status: "completed", provider_amount: 50 }], now)).toMatchObject({ jobs: 1, total: 50, monthJobs: 0 });
  });
});
