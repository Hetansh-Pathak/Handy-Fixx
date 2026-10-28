import { describe, expect, it } from "vitest";
import { billFromBooking, canAddExtraWork, canAnswerExtraWork, dbExtraKind, extraItemsFromRows, extraWorkErrorMessage, type ExtraRow } from "./extras";
import { feeForServiceBill } from "../money/fee";

const row = (over: Partial<ExtraRow>): ExtraRow => ({
  id: "x", title: "Pipe joint", kind: "labour", amount: 100, photo_path: null, status: "pending", created_at: "2026-11-10T10:00:00Z", ...over,
});

describe("extra work from the database", () => {
  it("maps kinds and drops withdrawn items", () => {
    const items = extraItemsFromRows([row({ id: "a" }), row({ id: "b", kind: "parts", amount: "200.00", photo_path: "u/b.jpg" }), row({ id: "c", status: "withdrawn" })]);
    expect(items.map((i) => [i.id, i.kind, i.amount])).toEqual([["a", "service", 100], ["b", "part", 200]]);
    expect(dbExtraKind("part")).toBe("parts");
    expect(dbExtraKind("service")).toBe("labour");
  });

  it("rebuilds the PDF example: ₹349 + ₹100 approved = ₹449, fee ₹15", () => {
    // provider_amount already includes the approved ₹100 (decide_booking_extra adds it).
    const bill = billFromBooking({ provider_amount: 449 }, [row({ status: "approved" }), row({ id: "p", amount: 50 })]);
    expect(bill.rate).toBe(349);
    expect(bill.serviceBill).toBe(449);
    expect(bill.customerTotal).toBe(449);
    expect(bill.pendingTotal).toBe(50);
    expect(feeForServiceBill(bill.serviceBill)).toBe(15);
  });

  it("keeps parts out of the fee base", () => {
    const bill = billFromBooking({ provider_amount: 649 }, [row({ kind: "parts", amount: 200, status: "approved", photo_path: "u/1.jpg" })]);
    expect(bill.serviceBill).toBe(449);
    expect(bill.partsTotal).toBe(200);
    expect(bill.customerTotal).toBe(649);
  });

  it("knows when extras can be added and answered", () => {
    expect(canAddExtraWork("in_progress")).toBe(true);
    expect(canAddExtraWork("arrived")).toBe(false);
    expect(canAnswerExtraWork("arrived")).toBe(true);
    expect(canAnswerExtraWork("completed")).toBe(false);
  });

  it("explains database refusals", () => {
    expect(extraWorkErrorMessage("photo_required")).toMatch(/photo of the bill/);
    expect(extraWorkErrorMessage(undefined)).toMatch(/Try again/);
  });
});
