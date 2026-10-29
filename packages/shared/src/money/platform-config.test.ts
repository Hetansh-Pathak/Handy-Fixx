import { describe, expect, it } from "vitest";
import { FEE_MAX, FEE_MIN, FEE_RATE } from "./fee";
import { LAUNCH_PERIOD } from "./launch";
import { PLATFORM_RULES, feePreview } from "./platform-config";
import { RECHARGE_PACK_AMOUNTS } from "./wallet";

describe("PLATFORM_RULES", () => {
  it("is built from the single constants, never retyped", () => {
    expect(PLATFORM_RULES.fee).toMatchObject({ rate: FEE_RATE, min: FEE_MIN, max: FEE_MAX });
    expect(PLATFORM_RULES.launch).toEqual({ jobs: LAUNCH_PERIOD.jobs, months: LAUNCH_PERIOD.months });
    expect(PLATFORM_RULES.wallet.packs).toEqual(RECHARGE_PACK_AMOUNTS);
  });
  it("keeps customers free and allows no dues", () => {
    expect(PLATFORM_RULES.customerFee).toBe(0);
    expect(PLATFORM_RULES.wallet.allowsDues).toBe(false);
    expect(PLATFORM_RULES.wallet.holdsFeeOnAccept).toBe(true);
  });
  it("cannot be changed at run time", () => {
    expect(Object.isFrozen(PLATFORM_RULES)).toBe(true);
    expect(Object.isFrozen(PLATFORM_RULES.fee)).toBe(true);
  });
});

describe("feePreview", () => {
  it("works a normal job: 3% of ₹349 is ₹10", () => {
    expect(feePreview({ serviceBill: 349 })).toEqual({
      serviceBill: 349, parts: 0, customerPays: 349, ruleFee: 10, charged: 10, waived: 0, proNets: 339,
    });
  });
  it("leaves parts out of the fee but in what the customer pays", () => {
    const p = feePreview({ serviceBill: 349, parts: 200 });
    expect(p.ruleFee).toBe(10);
    expect(p.customerPays).toBe(549);
    expect(p.proNets).toBe(539);
  });
  it("applies the minimum and the maximum", () => {
    expect(feePreview({ serviceBill: 100 }).ruleFee).toBe(FEE_MIN);
    expect(feePreview({ serviceBill: 5000 }).ruleFee).toBe(FEE_MAX);
  });
  it("shows the real fee as waived in the launch period and charges nothing", () => {
    expect(feePreview({ serviceBill: 349, launchActive: true })).toMatchObject({ ruleFee: 10, charged: 0, waived: 10, proNets: 349 });
  });
  it("costs nothing for an empty or invalid bill", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(feePreview({ serviceBill: bad })).toMatchObject({ ruleFee: 0, charged: 0, customerPays: 0, proNets: 0 });
    }
  });
});
