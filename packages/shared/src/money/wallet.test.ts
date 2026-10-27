import { describe, expect, it } from "vitest";
import { applyTopUp, checkCanAccept, MAX_TOPUP, MIN_TOPUP, settleJob, validateTopUp } from "./wallet";

const w = (balance: number, due = 0) => ({ balance, due });

describe("checkCanAccept", () => {
  it("skips the wallet check during the launch period", () => {
    expect(checkCanAccept({ wallet: w(0), estimatedServiceBill: 349, launchActive: true }))
      .toEqual({ ok: true, fee: 15, feeWaived: true });
  });
  it("lets a provider accept when the wallet covers the fee", () => {
    expect(checkCanAccept({ wallet: w(15), estimatedServiceBill: 349, launchActive: false }))
      .toEqual({ ok: true, fee: 15, feeWaived: false });
  });
  it("blocks accept when the wallet is below the fee and suggests the ₹100 minimum top-up", () => {
    expect(checkCanAccept({ wallet: w(10), estimatedServiceBill: 349, launchActive: false })).toEqual({
      ok: false, reason: "insufficient_wallet", fee: 15, shortfall: 5, suggestedTopUp: MIN_TOPUP,
    });
  });
  it("suggests a bigger top-up when dues are large", () => {
    const r = checkCanAccept({ wallet: w(0, 180), estimatedServiceBill: 1600, launchActive: false });
    expect(r).toMatchObject({ ok: false, reason: "due_outstanding", fee: 50, shortfall: 230, suggestedTopUp: 230 });
  });
  it("blocks while any due is outstanding, even if the balance covers the fee", () => {
    expect(checkCanAccept({ wallet: w(500, 15), estimatedServiceBill: 349, launchActive: false }))
      .toMatchObject({ ok: false, reason: "due_outstanding", shortfall: 0, suggestedTopUp: MIN_TOPUP });
  });
});

describe("settleJob (PDF p.8)", () => {
  const completed = { outcome: "completed" as const, serviceBill: 449, customerTotal: 449 };

  it("deducts the flat fee from the wallet: the PDF example, pro nets ₹434", () => {
    const s = settleJob({ ...completed, wallet: w(240), launchActive: false });
    expect(s).toMatchObject({ slabFee: 15, deducted: 15, addedToDue: 0, waived: 0, providerNet: 434 });
    expect(s.wallet).toEqual({ balance: 225, due: 0 });
  });
  it("waives the fee in the launch period but still records the real slab", () => {
    const s = settleJob({ ...completed, wallet: w(0), launchActive: true });
    expect(s).toMatchObject({ slabFee: 15, deducted: 0, waived: 15, providerNet: 449 });
    expect(s.wallet).toEqual({ balance: 0, due: 0 });
  });
  it("moves the whole fee to due when the wallet can't cover it; the job still completes", () => {
    const s = settleJob({ ...completed, wallet: w(10, 5), launchActive: false });
    expect(s).toMatchObject({ deducted: 0, addedToDue: 15, providerNet: 434 });
    expect(s.wallet).toEqual({ balance: 10, due: 20 });
  });
  it("uses the larger slab for bigger bills", () => {
    expect(settleJob({ outcome: "completed", serviceBill: 1500, customerTotal: 1800, wallet: w(100), launchActive: false }))
      .toMatchObject({ slabFee: 30, deducted: 30, providerNet: 1770 });
    expect(settleJob({ outcome: "completed", serviceBill: 1501, customerTotal: 1501, wallet: w(100), launchActive: false }))
      .toMatchObject({ slabFee: 50, deducted: 50 });
  });
  it.each(["cancelled", "disputed_refunded"] as const)("never touches the wallet on a %s job", (outcome) => {
    const s = settleJob({ outcome, serviceBill: 449, customerTotal: 449, wallet: w(240, 15), launchActive: false });
    expect(s).toMatchObject({ slabFee: 0, deducted: 0, addedToDue: 0, waived: 0 });
    expect(s.wallet).toEqual({ balance: 240, due: 15 });
  });
});

describe("top-ups", () => {
  it("enforces the minimum", () => {
    expect(validateTopUp(99)).toEqual({ ok: false, error: "Minimum top-up is ₹100." });
    expect(validateTopUp(100)).toEqual({ ok: true });
    expect(validateTopUp(Number.NaN).ok).toBe(false);
  });
  it("clears dues first, then credits the balance", () => {
    expect(applyTopUp(w(0, 45), 100)).toEqual({ balance: 55, due: 0 });
    expect(applyTopUp(w(20, 0), 100)).toEqual({ balance: 120, due: 0 });
    expect(applyTopUp(w(0, 300), 100)).toEqual({ balance: 0, due: 200 });
  });
  it("unblocks accepting once the due is paid", () => {
    const wallet = applyTopUp(w(0, 15), 100);
    expect(checkCanAccept({ wallet, estimatedServiceBill: 349, launchActive: false }).ok).toBe(true);
  });
});

describe("validateTopUp limits", () => {
  it("rejects paise and amounts above the server limit", () => {
    expect(validateTopUp(150.5)).toEqual({ ok: false, error: "Enter a whole rupee amount." });
    expect(validateTopUp(MAX_TOPUP + 1)).toEqual({ ok: false, error: "Maximum top-up is ₹50,000." });
    expect(validateTopUp(MAX_TOPUP)).toEqual({ ok: true });
  });
});
