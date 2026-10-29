import { describe, expect, it } from "vitest";
import { computeBill, respondToExtraWork, validateNewExtraWork, type ExtraWorkItem } from "./bill";
import { feeForServiceBill } from "./fee";

const item = (over: Partial<ExtraWorkItem>): ExtraWorkItem => ({
  id: "x", description: "Pipe joint replaced", amount: 100, kind: "service", status: "approved", ...over,
});

describe("computeBill", () => {
  it("matches the PDF worked example: ₹349 + ₹100 approved extra = ₹449, no customer fee", () => {
    const bill = computeBill({ rate: 349, extras: [item({})] });
    expect(bill.serviceBill).toBe(449);
    expect(bill.customerTotal).toBe(449);
    expect(bill.customerPlatformFee).toBe(0);
    expect(feeForServiceBill(bill.serviceBill)).toBe(13); // 3% of ₹449
  });

  it("ignores pending and declined extras but reports pending ones", () => {
    const bill = computeBill({
      rate: 349,
      extras: [item({ status: "pending", amount: 100 }), item({ status: "declined", amount: 999 })],
    });
    expect(bill.customerTotal).toBe(349);
    expect(bill.pendingTotal).toBe(100);
  });

  it("keeps parts out of the service bill (so they never change the fee)", () => {
    const bill = computeBill({
      rate: 450,
      extras: [item({ kind: "part", amount: 300, billPhotoPath: "bill.jpg" })],
    });
    expect(bill.serviceBill).toBe(450);
    expect(bill.partsTotal).toBe(300);
    expect(bill.customerTotal).toBe(750);
    expect(feeForServiceBill(bill.serviceBill)).toBe(14); // 3% of ₹450; would be ₹23 if parts were counted
  });

  it("approved extras raise the fee", () => {
    const bill = computeBill({ rate: 450, extras: [item({ amount: 100 })] });
    expect(bill.serviceBill).toBe(550);
    expect(feeForServiceBill(bill.serviceBill)).toBe(17); // 3% of ₹550
  });

  it("works with no extras", () => {
    expect(computeBill({ rate: 299 }).customerTotal).toBe(299);
  });
});

describe("validateNewExtraWork", () => {
  const ok = { description: "Pipe joint replaced", amount: 100, kind: "service" as const };
  it("accepts valid extra work while the job is in progress", () => {
    expect(validateNewExtraWork(ok, "in_progress")).toEqual({});
  });
  it.each(["pending", "confirmed", "on_the_way", "arrived", "completed", "cancelled"])(
    "refuses extra work when status is %s",
    (status) => {
      expect(validateNewExtraWork(ok, status).status).toBeDefined();
    },
  );
  it("requires a description and a positive amount", () => {
    const errors = validateNewExtraWork({ ...ok, description: " a ", amount: 0 }, "in_progress");
    expect(errors.description).toBeDefined();
    expect(errors.amount).toBeDefined();
    expect(validateNewExtraWork({ ...ok, description: "x".repeat(201) }, "in_progress").description).toBeDefined();
  });
  it("requires a bill photo for parts only", () => {
    expect(validateNewExtraWork({ ...ok, kind: "part" }, "in_progress").billPhoto).toBeDefined();
    expect(validateNewExtraWork({ ...ok, kind: "part", billPhotoPath: "p.jpg" }, "in_progress")).toEqual({});
    expect(validateNewExtraWork(ok, "in_progress").billPhoto).toBeUndefined();
  });
});

describe("respondToExtraWork", () => {
  it("approves or declines a pending item without mutating it", () => {
    const pending = item({ status: "pending" });
    expect(respondToExtraWork(pending, "approve").status).toBe("approved");
    expect(respondToExtraWork(pending, "decline").status).toBe("declined");
    expect(pending.status).toBe("pending");
  });
  it("cannot be answered twice", () => {
    expect(() => respondToExtraWork(item({ status: "approved" }), "decline")).toThrow(/already approved/);
  });
});
