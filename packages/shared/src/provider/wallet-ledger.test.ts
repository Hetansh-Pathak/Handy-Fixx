import { describe, expect, it } from "vitest";
import { describeLedgerEntry, earningsSummary, interpretPayout, payoutErrorMessage } from "./wallet-ledger";

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
  it("handles a booking with no date", () => {
    expect(earningsSummary([{ status: "completed", provider_amount: 50 }], now)).toMatchObject({ jobs: 1, total: 50, monthJobs: 0 });
  });
});
