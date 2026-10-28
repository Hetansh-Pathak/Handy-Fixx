import { describe, expect, it } from "vitest";
import { CUSTOMER_PLATFORM_FEE, FEE_MAX, FEE_MIN, FEE_RATE, FEE_RULE_LABEL, feeForServiceBill } from "./fee";

describe("feeForServiceBill (3% per job, min ₹5, max ₹50)", () => {
  it.each([
    [1, 5], // 3 paise -> minimum
    [99, 5], // ₹2.97 -> minimum
    [166, 5], // ₹4.98 rounds to 5
    [167, 5], // ₹5.01 rounds to 5
    [183, 5], // ₹5.49
    [184, 6], // ₹5.52
    [250, 8], // ₹7.50 rounds half up, like Postgres round()
    [400, 12],
    [1666, 50], // ₹49.98 rounds to 50
    [1667, 50], // ₹50.01 capped
    [5000, 50],
    [349.5, 10], // ₹10.485
  ])("bill ₹%s -> fee ₹%s", (bill, fee) => {
    expect(feeForServiceBill(bill)).toBe(fee);
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])("charges nothing for invalid bill %s", (bill) => {
    expect(feeForServiceBill(bill)).toBe(0);
  });

  it("every whole-rupee bill up to ₹2,000 matches exact decimal rounding", () => {
    for (let bill = 1; bill <= 2000; bill++) {
      const exact = Math.floor((bill * 3 + 50) / 100); // round half up of bill*3/100 in integers
      expect(feeForServiceBill(bill)).toBe(Math.min(FEE_MAX, Math.max(FEE_MIN, exact)));
    }
  });

  it("exposes the rule for screens", () => {
    expect([FEE_RATE, FEE_MIN, FEE_MAX]).toEqual([0.03, 5, 50]);
    expect(FEE_RULE_LABEL).toBe("3% per job, min ₹5, max ₹50");
  });

  it("never charges the customer a platform fee", () => {
    expect(CUSTOMER_PLATFORM_FEE).toBe(0);
  });
});
