import { describe, expect, it } from "vitest";
import { DECLINED_REASON, MISSED_REQUEST_REASON, needsAlternatives, requestOutcome } from "./request-outcome";

// Local-time constructor keeps these tests timezone-independent.
const now = new Date(2026, 10, 10, 11, 30);

describe("requestOutcome", () => {
  it("keeps waiting for the pro with no countdown, until the booked time starts", () => {
    expect(requestOutcome({ status: "pending", bookingDate: "2026-11-10", bookingTime: "14:00:00" }, now)).toBe("waiting");
    expect(requestOutcome({ status: "pending", bookingDate: "2026-11-11", bookingTime: "08:00:00" }, now)).toBe("waiting");
    expect(requestOutcome({ status: "pending", bookingDate: "2026-11-10", bookingTime: "11:30:00" }, now)).toBe("expired");
    expect(requestOutcome({ status: "pending", bookingDate: "2026-11-09", bookingTime: "18:00:00" }, now)).toBe("expired");
  });
  it("keeps waiting if the booked time is unknown (never invent an expiry)", () => {
    expect(requestOutcome({ status: "pending" }, now)).toBe("waiting");
    expect(requestOutcome({ status: "pending", bookingDate: "garbage", bookingTime: "10:00" }, now)).toBe("waiting");
  });
  it("tells a decline apart from other cancellations", () => {
    expect(requestOutcome({ status: "cancelled", cancellationReason: DECLINED_REASON }, now)).toBe("declined");
    expect(requestOutcome({ status: "cancelled", cancellationReason: "Cancelled by customer" }, now)).toBe("cancelled");
    expect(requestOutcome({ status: "cancelled", cancellationReason: null }, now)).toBe("cancelled");
  });
  it("accepted covers every status from confirmed to in progress; completed is separate", () => {
    for (const status of ["confirmed", "on_the_way", "arrived", "in_progress"]) expect(requestOutcome({ status }, now)).toBe("accepted");
    expect(requestOutcome({ status: "completed" }, now)).toBe("completed");
  });
});

describe("needsAlternatives", () => {
  it("offers other pros only after a decline or once the time has passed", () => {
    expect(needsAlternatives("expired")).toBe(true);
    expect(needsAlternatives("declined")).toBe(true);
    for (const o of ["waiting", "accepted", "cancelled", "completed"] as const) expect(needsAlternatives(o)).toBe(false);
  });
});

describe("a request stays open until a pro answers it (owner decision 2026-10-29)", () => {
  it("is never closed for being old: an old request for a future time is still waiting", () => {
    expect(requestOutcome({ status: "pending", bookingDate: "2026-11-20", bookingTime: "10:00:00" }, now)).toBe("waiting");
  });
  it("a request the database closed after its booked time passed reads as missed, and offers the next best pros", () => {
    const o = requestOutcome({ status: "cancelled", cancellationReason: MISSED_REQUEST_REASON }, now);
    expect(o).toBe("expired");
    expect(needsAlternatives(o)).toBe(true);
  });
  it("other cancellations stay cancellations", () => {
    expect(requestOutcome({ status: "cancelled", cancellationReason: "Cancelled by customer" }, now)).toBe("cancelled");
    expect(requestOutcome({ status: "cancelled", cancellationReason: null }, now)).toBe("cancelled");
  });
});
