import { describe, expect, it } from "vitest";
import { DECLINED_REASON, needsAlternatives, requestOutcome, waitSecondsLeft } from "./request-outcome";

const now = new Date("2026-11-10T10:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();

describe("requestOutcome", () => {
  it("waits for the pro for 30 seconds, then the request has expired", () => {
    expect(requestOutcome({ status: "pending", createdAt: ago(5) }, now)).toBe("waiting");
    expect(requestOutcome({ status: "pending", createdAt: ago(29) }, now)).toBe("waiting");
    expect(requestOutcome({ status: "pending", createdAt: ago(30) }, now)).toBe("expired");
    expect(requestOutcome({ status: "pending", createdAt: ago(600) }, now)).toBe("expired");
  });
  it("keeps waiting if the creation time is unknown (never invent an expiry)", () => {
    expect(requestOutcome({ status: "pending", createdAt: null }, now)).toBe("waiting");
    expect(requestOutcome({ status: "pending", createdAt: "garbage" }, now)).toBe("waiting");
  });
  it("tells a decline apart from other cancellations", () => {
    expect(requestOutcome({ status: "cancelled", createdAt: ago(9), cancellationReason: DECLINED_REASON }, now)).toBe("declined");
    expect(requestOutcome({ status: "cancelled", createdAt: ago(9), cancellationReason: "Cancelled by customer" }, now)).toBe("cancelled");
    expect(requestOutcome({ status: "cancelled", createdAt: ago(9), cancellationReason: null }, now)).toBe("cancelled");
  });
  it("accepted covers every status from confirmed to in progress; completed is separate", () => {
    for (const status of ["confirmed", "on_the_way", "arrived", "in_progress"]) expect(requestOutcome({ status, createdAt: ago(1) }, now)).toBe("accepted");
    expect(requestOutcome({ status: "completed", createdAt: ago(1) }, now)).toBe("completed");
  });
});

describe("alternatives and countdown", () => {
  it("offers other pros only after a decline or a timeout", () => {
    expect(needsAlternatives("expired")).toBe(true);
    expect(needsAlternatives("declined")).toBe(true);
    for (const o of ["waiting", "accepted", "cancelled", "completed"] as const) expect(needsAlternatives(o)).toBe(false);
  });
  it("counts the pro's window down for the waiting line", () => {
    expect(waitSecondsLeft(ago(0), now)).toBe(30);
    expect(waitSecondsLeft(ago(12), now)).toBe(18);
    expect(waitSecondsLeft(ago(99), now)).toBe(0);
    expect(waitSecondsLeft(null, now)).toBe(30);
    expect(waitSecondsLeft(ago(-10), now)).toBe(30);
  });
});
