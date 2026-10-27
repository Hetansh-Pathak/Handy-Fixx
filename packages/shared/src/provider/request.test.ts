import { describe, expect, it } from "vitest";
import { isRequestOpen, pickCurrentRequest, requestEconomics } from "./request";

const now = new Date("2026-11-10T10:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();

describe("isRequestOpen", () => {
  it("is open while pending and under 30 seconds old", () => {
    expect(isRequestOpen({ status: "pending", createdAt: ago(0) }, now)).toBe(true);
    expect(isRequestOpen({ status: "pending", createdAt: ago(29) }, now)).toBe(true);
    expect(isRequestOpen({ status: "pending", createdAt: ago(30) }, now)).toBe(false);
    expect(isRequestOpen({ status: "pending", createdAt: ago(300) }, now)).toBe(false);
  });
  it("tolerates a device clock behind the server", () => {
    expect(isRequestOpen({ status: "pending", createdAt: ago(-5) }, now)).toBe(true);
  });
  it("is never open once answered, or with a missing or bad timestamp", () => {
    for (const status of ["confirmed", "cancelled", "completed", "in_progress"]) expect(isRequestOpen({ status, createdAt: ago(1) }, now)).toBe(false);
    for (const bad of [null, undefined, "", "nope"]) expect(isRequestOpen({ status: "pending", createdAt: bad }, now)).toBe(false);
  });
});

describe("pickCurrentRequest", () => {
  it("returns the oldest open request and skips stale and answered ones", () => {
    const rows = [
      { id: "new", status: "pending", created_at: ago(2) },
      { id: "old", status: "pending", created_at: ago(20) },
      { id: "stale", status: "pending", created_at: ago(90) },
      { id: "done", status: "confirmed", created_at: ago(5) },
    ];
    expect(pickCurrentRequest(rows, now)?.id).toBe("old");
  });
  it("returns null when nothing is open", () => {
    expect(pickCurrentRequest([], now)).toBeNull();
    expect(pickCurrentRequest([{ id: "x", status: "pending", created_at: ago(99) }], now)).toBeNull();
  });
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
