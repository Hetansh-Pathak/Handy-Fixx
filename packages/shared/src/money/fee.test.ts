import { describe, expect, it } from "vitest";
import { CUSTOMER_PLATFORM_FEE, feeForServiceBill } from "./fee";

describe("feeForServiceBill (PDF p.3 slabs)", () => {
  it.each([
    [0.01, 15],
    [349, 15],
    [449, 15],
    [499.99, 15],
    [500, 30], // lower bound of the middle slab
    [1500, 30], // upper bound is inclusive
    [1500.01, 50],
    [5000, 50],
  ])("bill ₹%s -> fee ₹%s", (bill, fee) => {
    expect(feeForServiceBill(bill)).toBe(fee);
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])("charges nothing for invalid bill %s", (bill) => {
    expect(feeForServiceBill(bill)).toBe(0);
  });

  it("never charges the customer a platform fee", () => {
    expect(CUSTOMER_PLATFORM_FEE).toBe(0);
  });
});
