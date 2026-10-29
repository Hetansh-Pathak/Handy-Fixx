import { describe, expect, it } from "vitest";
import { REFUND_POLICY, refundDecision, refundPolicyLines } from "./refund-policy";

describe("customer cancels", () => {
  it("gets everything back while pending or confirmed, never a cancellation fee", () => {
    expect(REFUND_POLICY.customerCancellationFee).toBe(0);
    for (const status of ["pending", "confirmed"] as const) {
      const d = refundDecision({ kind: "customer_cancelled", status, late: false }, { paid: 349 });
      expect(d).toMatchObject({ amount: 349, fraction: 1, needsAdmin: false, countsAsLateCancel: false, proFeeReturned: true });
    }
  });
  it("a late cancel after acceptance is still fully refunded but counts towards the pause", () => {
    const d = refundDecision({ kind: "customer_cancelled", status: "confirmed", late: true }, { paid: 349 });
    expect(d.amount).toBe(349);
    expect(d.countsAsLateCancel).toBe(true);
  });
  it("a request nobody had accepted never counts as a late cancel", () => {
    expect(refundDecision({ kind: "customer_cancelled", status: "pending", late: true }, { paid: 349 }).countsAsLateCancel).toBe(false);
  });
});

describe("the pro's fault is always refunded in full", () => {
  for (const kind of ["pro_declined", "request_missed", "pro_no_show"] as const) {
    it(kind, () => expect(refundDecision({ kind }, { paid: 599, visitFee: 129, proArrived: true })).toMatchObject({ amount: 599, fraction: 1, proFeeReturned: true }));
  }
});

describe("after the trip started", () => {
  it("keeps only the visit fee once the pro arrived, and an admin confirms", () => {
    const d = refundDecision({ kind: "customer_cancelled_after_trip_started" }, { paid: 129, visitFee: 129, proArrived: true });
    expect(d).toMatchObject({ amount: 0, needsAdmin: true });
    expect(refundDecision({ kind: "customer_cancelled_after_trip_started" }, { paid: 549, visitFee: 129, proArrived: true }).amount).toBe(420);
  });
  it("without an arrival, support decides and the default is a full refund", () => {
    expect(refundDecision({ kind: "customer_cancelled_after_trip_started" }, { paid: 349, proArrived: false })).toMatchObject({ amount: 349, needsAdmin: true });
  });
});

describe("dispute outcomes", () => {
  it("dismissed and redo refund nothing", () => {
    expect(refundDecision({ kind: "dispute", outcome: "dismissed" }, { paid: 349 }).amount).toBe(0);
    expect(refundDecision({ kind: "dispute", outcome: "redo" }, { paid: 349 }).amount).toBe(0);
  });
  it("partial refund follows the admin's amount, capped at what was paid, and asks for one when missing", () => {
    expect(refundDecision({ kind: "dispute", outcome: "partial_refund", adminAmount: 100 }, { paid: 349 })).toMatchObject({ amount: 100, needsAdmin: false });
    expect(refundDecision({ kind: "dispute", outcome: "partial_refund", adminAmount: 9999 }, { paid: 349 }).amount).toBe(349);
    expect(refundDecision({ kind: "dispute", outcome: "partial_refund", adminAmount: -5 }, { paid: 349 }).amount).toBe(0);
    expect(refundDecision({ kind: "dispute", outcome: "partial_refund" }, { paid: 349 })).toMatchObject({ amount: 0, needsAdmin: true });
  });
  it("a provider penalty defaults to a refund that keeps an arrived visit fee", () => {
    expect(refundDecision({ kind: "dispute", outcome: "provider_penalty" }, { paid: 549, visitFee: 129, proArrived: true })).toMatchObject({ amount: 420, needsAdmin: true, proFeeReturned: true });
  });
  it("safety returns everything", () => {
    expect(refundDecision({ kind: "dispute", outcome: "safety" }, { paid: 549, visitFee: 129, proArrived: true })).toMatchObject({ amount: 549, fraction: 1 });
  });
});

describe("safety of the numbers", () => {
  it("never refunds more than paid or a negative amount, and copes with bad input", () => {
    for (const paid of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
      const d = refundDecision({ kind: "pro_declined" }, { paid });
      expect(d.amount).toBeGreaterThanOrEqual(0);
      expect(d.fraction).toBeGreaterThanOrEqual(0);
    }
    expect(refundDecision({ kind: "pro_declined" }, { paid: 100.456 }).amount).toBe(100.46);
    expect(refundDecision({ kind: "customer_cancelled_after_trip_started" }, { paid: 100, visitFee: 500, proArrived: true }).amount).toBe(0);
  });
  it("is frozen and states its draft status and gateway cost rule in plain lines", () => {
    expect(Object.isFrozen(REFUND_POLICY)).toBe(true);
    expect(REFUND_POLICY.status).toContain("not enforced");
    const lines = refundPolicyLines().join(" ");
    expect(lines).toContain("never charge you to cancel");
    expect(lines).toContain("24 hours");
  });
});
