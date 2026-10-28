import { describe, expect, it } from "vitest";
import {
  adminDecisionDeadline, disputeWindowHours, isDisputeWindowOpen, isSafetyReport, openDisputeReasons,
  providerReplyDeadline, DISPUTE_REASONS, DISPUTE_OUTCOMES, DISPUTE_REASON_LABEL, DISPUTE_OUTCOME_LABEL,
  disputeActions, disputeStatusText, validateDisputeDetails, disputeErrorMessage,
} from "./dispute";

const done = new Date("2026-11-10T10:00:00Z");
const after = (h: number) => new Date(done.getTime() + h * 3_600_000);

describe("dispute window", () => {
  it("is 24h normally and 48h for repair quality", () => {
    expect(disputeWindowHours("poor_work")).toBe(48);
    expect(disputeWindowHours("overcharged")).toBe(24);
  });
  it("offers every reason in the first 24 hours", () => {
    expect(openDisputeReasons(done, after(1))).toEqual([...DISPUTE_REASONS]);
    expect(openDisputeReasons(done, after(24))).toEqual([...DISPUTE_REASONS]);
  });
  it("leaves only repair quality between 24 and 48 hours", () => {
    expect(openDisputeReasons(done, after(30))).toEqual(["poor_work", "safety"]);
    expect(isDisputeWindowOpen(done, after(48))).toBe(true);
  });
  it("closes after 48 hours", () => {
    expect(openDisputeReasons(done, after(48.01))).toEqual(["safety"]);
    expect(isDisputeWindowOpen(done, after(72))).toBe(false);
  });
  it("is closed before completion", () => {
    expect(isDisputeWindowOpen(done, after(-1))).toBe(false);
  });
  it("sets deadlines", () => {
    expect(providerReplyDeadline(done)).toEqual(after(24));
    expect(adminDecisionDeadline(done)).toEqual(after(48));
  });
  it("escalates only safety reports", () => {
    expect(isSafetyReport("safety")).toBe(true);
    expect(isSafetyReport("behaviour")).toBe(false);
    expect(isSafetyReport("no_show")).toBe(false);
  });
});

describe("dispute actions and messages", () => {
  const open = { status: "open" as const, outcome: null, providerReply: null, appealedAt: null };
  it("lets only the pro reply, once, while open", () => {
    expect(disputeActions(open, "provider").canReply).toBe(true);
    expect(disputeActions(open, "customer").canReply).toBe(false);
    expect(disputeActions({ ...open, providerReply: "I fixed it" }, "provider").canReply).toBe(false);
  });
  it("allows one appeal after a decision", () => {
    const decided = { ...open, status: "decided" as const, outcome: "dismissed" as const };
    expect(disputeActions(open, "customer").canAppeal).toBe(false);
    expect(disputeActions(decided, "customer").canAppeal).toBe(true);
    expect(disputeActions(decided, "provider").canAppeal).toBe(true);
    expect(disputeActions({ ...decided, appealedAt: "2026-11-11T00:00:00Z" }, "customer").canAppeal).toBe(false);
    expect(disputeActions({ ...decided, status: "closed" }, "customer").canAppeal).toBe(false);
  });
  it("describes each state", () => {
    expect(disputeStatusText(open)).toMatch(/within 24 hours/);
    expect(disputeStatusText({ ...open, status: "appealed" })).toMatch(/second admin/);
    expect(disputeStatusText({ ...open, status: "decided", outcome: "redo" })).toMatch(/7 days/);
    expect(disputeStatusText({ ...open, status: "closed", outcome: "dismissed" })).toMatch(/^Final decision/);
  });
  it("validates details", () => {
    expect(validateDisputeDetails("short")).toMatch(/at least 10/);
    expect(validateDisputeDetails("The tap still leaks badly")).toBeNull();
    expect(validateDisputeDetails("x".repeat(1001))).toMatch(/under 1000/);
  });
  it("maps database reasons to sentences", () => {
    expect(disputeErrorMessage("window_closed")).toMatch(/passed/);
    expect(disputeErrorMessage("weird")).toMatch(/Try again/);
    expect(disputeErrorMessage(null)).toMatch(/Try again/);
  });
  it("labels every reason and outcome", () => {
    for (const r of DISPUTE_REASONS) expect(DISPUTE_REASON_LABEL[r]).toBeTruthy();
    for (const o of DISPUTE_OUTCOMES) expect(DISPUTE_OUTCOME_LABEL[o]).toBeTruthy();
  });
});
