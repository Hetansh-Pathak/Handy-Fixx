import { describe, expect, it } from "vitest";
import {
  adminDecisionDeadline, disputeWindowHours, isDisputeWindowOpen, isSafetyReport, openDisputeReasons,
  providerReplyDeadline, DISPUTE_REASONS,
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
    expect(openDisputeReasons(done, after(30))).toEqual(["poor_work"]);
    expect(isDisputeWindowOpen(done, after(48))).toBe(true);
  });
  it("closes after 48 hours", () => {
    expect(openDisputeReasons(done, after(48.01))).toEqual([]);
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
    expect(isSafetyReport("behaviour")).toBe(true);
    expect(isSafetyReport("no_show")).toBe(false);
  });
});
