import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CANCEL_REASON, LATE_CANCEL_HOURS, LATE_CANCEL_REASON, cancellationReasonFor, isLateCancellation, lateCancellationTimes, pauseMessage,
} from "./cancellation";
import { instantBookingPause } from "./cancellation";

const now = new Date("2026-11-30T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("instantBookingPause", () => {
  it("does not pause below 3 late cancellations", () => {
    expect(instantBookingPause([daysAgo(1), daysAgo(2)], now)).toEqual({ paused: false });
  });
  it("pauses for a week after 3 in 30 days", () => {
    const r = instantBookingPause([daysAgo(10), daysAgo(5), daysAgo(1)], now);
    expect(r).toEqual({ paused: true, until: new Date(daysAgo(1).getTime() + 7 * 86_400_000) });
  });
  it("ignores cancellations older than 30 days", () => {
    expect(instantBookingPause([daysAgo(45), daysAgo(40), daysAgo(1), daysAgo(2)], now)).toEqual({ paused: false });
  });
  it("lifts the pause once the week has passed", () => {
    expect(instantBookingPause([daysAgo(20), daysAgo(15), daysAgo(10)], now)).toEqual({ paused: false });
  });
  it("ignores future timestamps", () => {
    expect(instantBookingPause([daysAgo(2), daysAgo(1), daysAgo(-1)], now)).toEqual({ paused: false });
  });
});

describe("isLateCancellation", () => {
  const starts = (h: number) => {
    const d = new Date(now.getTime() + h * 3_600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}:00` };
  };
  it("is late when a pro already accepted and the start is under 2 hours away", () => {
    const s = starts(1);
    expect(isLateCancellation({ status: "confirmed", bookingDate: s.date, bookingTime: s.time }, now)).toBe(true);
    expect(isLateCancellation({ status: "on_the_way", bookingDate: s.date, bookingTime: s.time }, now)).toBe(true);
  });
  it("is not late with plenty of notice", () => {
    const s = starts(LATE_CANCEL_HOURS + 1);
    expect(isLateCancellation({ status: "confirmed", bookingDate: s.date, bookingTime: s.time }, now)).toBe(false);
  });
  it("is never late while the request is still pending (no pro was committed)", () => {
    const s = starts(0.5);
    expect(isLateCancellation({ status: "pending", bookingDate: s.date, bookingTime: s.time }, now)).toBe(false);
  });
  it("is not late when the time is unknown or the job is finished", () => {
    expect(isLateCancellation({ status: "confirmed", bookingDate: null, bookingTime: null }, now)).toBe(false);
    const s = starts(1);
    expect(isLateCancellation({ status: "completed", bookingDate: s.date, bookingTime: s.time }, now)).toBe(false);
    expect(isLateCancellation({ status: "cancelled", bookingDate: s.date, bookingTime: s.time }, now)).toBe(false);
  });
});

describe("cancellationReasonFor", () => {
  it("marks a late cancellation so it can be counted later", () => {
    expect(cancellationReasonFor(true)).toBe(LATE_CANCEL_REASON);
    expect(cancellationReasonFor(false)).toBe(CUSTOMER_CANCEL_REASON);
    expect(LATE_CANCEL_REASON.startsWith(CUSTOMER_CANCEL_REASON)).toBe(true);
  });
});

describe("lateCancellationTimes", () => {
  it("keeps only late cancellations that have a time", () => {
    const rows = [
      { status: "cancelled", cancellation_reason: LATE_CANCEL_REASON, cancelled_at: "2026-11-29T10:00:00Z" },
      { status: "cancelled", cancellation_reason: CUSTOMER_CANCEL_REASON, cancelled_at: "2026-11-28T10:00:00Z" },
      { status: "cancelled", cancellation_reason: "Declined by provider", cancelled_at: "2026-11-27T10:00:00Z" },
      { status: "cancelled", cancellation_reason: LATE_CANCEL_REASON, cancelled_at: null },
      { status: "completed", cancellation_reason: LATE_CANCEL_REASON, cancelled_at: "2026-11-26T10:00:00Z" },
      { status: "cancelled", cancellation_reason: LATE_CANCEL_REASON, cancelled_at: "not a date" },
    ];
    expect(lateCancellationTimes(rows)).toEqual([new Date("2026-11-29T10:00:00Z")]);
  });
});

describe("pauseMessage", () => {
  it("says nothing when not paused", () => {
    expect(pauseMessage({ paused: false })).toBeNull();
  });
  it("tells the customer until when, in plain words", () => {
    const m = pauseMessage({ paused: true, until: new Date(2026, 11, 5, 15, 0) });
    expect(m).toMatch(/paused/i);
    expect(m).toMatch(/5 Dec/);
  });
});
