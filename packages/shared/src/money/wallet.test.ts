import { describe, expect, it } from "vitest";
import {
  applyTopUp, checkCanAccept, isRechargePack, jobsCovered, packFor, RECHARGE_PACK_AMOUNTS, RECHARGE_PACKS, settleJob, TYPICAL_BILL,
} from "./wallet";

const w = (balance: number, due = 0) => ({ balance, due });

describe("recharge packs", () => {
  it("are ₹49, ₹99 (most popular) and ₹199", () => {
    expect(RECHARGE_PACK_AMOUNTS).toEqual([49, 99, 199]);
    expect(RECHARGE_PACKS.filter((p) => p.popular).map((p) => p.amount)).toEqual([99]);
  });
  it("only the three packs are valid amounts", () => {
    for (const a of [49, 99, 199]) expect(isRechargePack(a)).toBe(true);
    for (const a of [0, 50, 100, 200, 49.5, -49, Number.NaN, "99"]) expect(isRechargePack(a)).toBe(false);
  });
  it("packFor picks the smallest pack that covers the need, else the biggest", () => {
    expect(packFor(0)).toBe(49);
    expect(packFor(12)).toBe(49);
    expect(packFor(49)).toBe(49);
    expect(packFor(50)).toBe(99);
    expect(packFor(150)).toBe(199);
    expect(packFor(500)).toBe(199);
  });
});

describe("jobsCovered", () => {
  it("uses a ₹400 typical bill (fee ₹12) by default", () => {
    expect(TYPICAL_BILL).toBe(400);
    expect(jobsCovered(49)).toBe(4);
    expect(jobsCovered(99)).toBe(8);
    expect(jobsCovered(199)).toBe(16);
    expect(jobsCovered(11.99)).toBe(0);
    expect(jobsCovered(12)).toBe(1);
  });
  it("takes another typical bill", () => {
    expect(jobsCovered(100, 2000)).toBe(2); // fee ₹50
    expect(jobsCovered(100, 100)).toBe(20); // fee ₹5 minimum
  });
  it("is 0 for an empty, negative or invalid balance or bill", () => {
    expect(jobsCovered(0)).toBe(0);
    expect(jobsCovered(-40)).toBe(0);
    expect(jobsCovered(Number.NaN)).toBe(0);
    expect(jobsCovered(100, 0)).toBe(0);
  });
});

describe("checkCanAccept", () => {
  it("skips the wallet check during the launch period", () => {
    expect(checkCanAccept({ wallet: w(0), estimatedServiceBill: 400, launchActive: true })).toEqual({ ok: true, fee: 12, feeWaived: true });
  });
  it("accepts when the spendable balance covers the fee exactly", () => {
    expect(checkCanAccept({ wallet: w(12), estimatedServiceBill: 400, launchActive: false })).toEqual({ ok: true, fee: 12, feeWaived: false });
  });
  it("blocks below the fee and suggests the ₹49 pack", () => {
    expect(checkCanAccept({ wallet: w(10), estimatedServiceBill: 400, launchActive: false })).toEqual({
      ok: false, reason: "insufficient_wallet", fee: 12, shortfall: 2, suggestedTopUp: 49,
    });
  });
  it("blocks while an old due is outstanding and suggests a pack that clears it", () => {
    expect(checkCanAccept({ wallet: w(0, 60), estimatedServiceBill: 400, launchActive: false }))
      .toMatchObject({ ok: false, reason: "due_outstanding", shortfall: 72, suggestedTopUp: 99 });
    expect(checkCanAccept({ wallet: w(500, 15), estimatedServiceBill: 400, launchActive: false }))
      .toMatchObject({ ok: false, reason: "due_outstanding", shortfall: 0, suggestedTopUp: 49 });
  });
  it("caps the suggestion at the biggest pack", () => {
    expect(checkCanAccept({ wallet: w(0, 400), estimatedServiceBill: 2000, launchActive: false }))
      .toMatchObject({ ok: false, shortfall: 450, suggestedTopUp: 199 });
  });
});

describe("settleJob with a fee held at accept", () => {
  const completed = { outcome: "completed" as const, serviceBill: 400, customerTotal: 400 };

  it("charges the hold when the bill did not change", () => {
    const s = settleJob({ ...completed, wallet: w(37), held: 12, launchActive: false });
    expect(s).toMatchObject({ fee: 12, deducted: 12, released: 0, addedToDue: 0, uncollected: 0, providerNet: 388 });
    expect(s.wallet).toEqual({ balance: 37, due: 0 });
  });
  it("releases the difference when the final fee is lower (₹5 minimum)", () => {
    const s = settleJob({ ...completed, serviceBill: 150, customerTotal: 150, wallet: w(0), held: 12, launchActive: false });
    expect(s).toMatchObject({ fee: 5, deducted: 5, released: 7 });
    expect(s.wallet).toEqual({ balance: 7, due: 0 });
  });
  it("takes extra from the balance when approved extras raised the fee", () => {
    const s = settleJob({ ...completed, serviceBill: 1000, customerTotal: 1000, wallet: w(20), held: 12, launchActive: false });
    expect(s).toMatchObject({ fee: 30, deducted: 30, released: 0, uncollected: 0 });
    expect(s.wallet).toEqual({ balance: 2, due: 0 });
  });
  it("never creates a due when a hold exists: what the wallet cannot cover is uncollected", () => {
    const s = settleJob({ ...completed, serviceBill: 2000, customerTotal: 2000, wallet: w(10), held: 12, launchActive: false });
    expect(s).toMatchObject({ fee: 50, deducted: 22, addedToDue: 0, uncollected: 28, providerNet: 1978 });
    expect(s.wallet).toEqual({ balance: 0, due: 0 });
  });
  it("waives the fee in the launch period and keeps the real figure", () => {
    const s = settleJob({ ...completed, wallet: w(0), launchActive: true });
    expect(s).toMatchObject({ fee: 12, deducted: 0, waived: 12, providerNet: 400 });
  });
  it.each(["cancelled", "disputed_refunded"] as const)("a %s job costs ₹0 and releases the whole hold", (outcome) => {
    const s = settleJob({ outcome, serviceBill: 400, customerTotal: 400, wallet: w(37), held: 12, launchActive: false });
    expect(s).toMatchObject({ fee: 0, deducted: 0, released: 12 });
    expect(s.wallet).toEqual({ balance: 49, due: 0 });
  });
});

describe("settleJob without a hold (accepted before holds existed)", () => {
  it("charges the balance and moves an uncovered fee to due, like before", () => {
    const s = settleJob({ outcome: "completed", serviceBill: 400, customerTotal: 400, wallet: w(5), launchActive: false });
    expect(s).toMatchObject({ fee: 12, deducted: 12, addedToDue: 7, uncollected: 0 });
    expect(s.wallet).toEqual({ balance: 0, due: 7 });
  });
});

describe("applyTopUp", () => {
  it("clears old dues first, then credits the balance", () => {
    expect(applyTopUp(w(0, 45), 99)).toEqual({ balance: 54, due: 0 });
    expect(applyTopUp(w(0, 300), 199)).toEqual({ balance: 0, due: 101 });
  });
  it("unblocks accepting once the due is paid", () => {
    expect(checkCanAccept({ wallet: applyTopUp(w(0, 15), 49), estimatedServiceBill: 400, launchActive: false }).ok).toBe(true);
  });
});
