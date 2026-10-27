import { describe, expect, it } from "vitest";
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
