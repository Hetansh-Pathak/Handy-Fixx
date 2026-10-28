import { describe, expect, it } from "vitest";
import { isRequestOpen, openRequests, requestEconomics } from "./request";

const now = new Date(2026, 10, 10, 11, 30);

describe("isRequestOpen", () => {
  it("stays open with no countdown while pending and before the booked time", () => {
    expect(isRequestOpen({ status: "pending", bookingDate: "2026-11-10", bookingTime: "14:00:00" }, now)).toBe(true);
    expect(isRequestOpen({ status: "pending", bookingDate: "2026-11-12", bookingTime: "09:00:00" }, now)).toBe(true);
  });
  it("closes once the booked time has started", () => {
    expect(isRequestOpen({ status: "pending", bookingDate: "2026-11-10", bookingTime: "11:30:00" }, now)).toBe(false);
    expect(isRequestOpen({ status: "pending", bookingDate: "2026-11-09", bookingTime: "18:00:00" }, now)).toBe(false);
  });
  it("is open if the time is unknown, never once answered", () => {
    expect(isRequestOpen({ status: "pending", bookingDate: null, bookingTime: null }, now)).toBe(true);
    for (const status of ["confirmed", "cancelled", "completed", "in_progress"]) {
      expect(isRequestOpen({ status, bookingDate: "2026-11-11", bookingTime: "10:00:00" }, now)).toBe(false);
    }
  });
});

describe("openRequests", () => {
  it("returns open requests oldest first and skips past and answered ones", () => {
    const rows = [
      { id: "new", status: "pending", created_at: "2026-11-10T06:00:00Z", booking_date: "2026-11-11", booking_time: "10:00:00" },
      { id: "old", status: "pending", created_at: "2026-11-10T05:00:00Z", booking_date: "2026-11-12", booking_time: "10:00:00" },
      { id: "past", status: "pending", created_at: "2026-11-09T05:00:00Z", booking_date: "2026-11-09", booking_time: "10:00:00" },
      { id: "done", status: "confirmed", created_at: "2026-11-10T04:00:00Z", booking_date: "2026-11-11", booking_time: "10:00:00" },
    ];
    expect(openRequests(rows, now).map((r) => r.id)).toEqual(["old", "new"]);
  });
  it("returns nothing when nothing is open", () => expect(openRequests([], now)).toEqual([]));
});

describe("requestEconomics (PDF p.7: earning and fee shown before deciding)", () => {
  it("normal job: the fee comes off what you keep", () => {
    expect(requestEconomics({ price: 349, launchActive: false })).toEqual({ earning: 349, fee: 15, feeWaived: false, youKeep: 334 });
  });
  it("launch period: the real fee is shown as waived and you keep everything", () => {
    expect(requestEconomics({ price: 349, launchActive: true })).toEqual({ earning: 349, fee: 15, feeWaived: true, youKeep: 349 });
  });
  it("uses the larger slabs for bigger jobs", () => {
    expect(requestEconomics({ price: 1500, launchActive: false })).toMatchObject({ fee: 30, youKeep: 1470 });
    expect(requestEconomics({ price: 1800, launchActive: false })).toMatchObject({ fee: 50, youKeep: 1750 });
  });
  it("a zero price has no fee and nothing to waive", () => {
    expect(requestEconomics({ price: 0, launchActive: true })).toEqual({ earning: 0, fee: 0, feeWaived: false, youKeep: 0 });
  });
});
