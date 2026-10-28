import { describe, expect, it } from "vitest";
import { APPROX_DECIMALS, approxPoint, distanceKm, formatDistance, readPoint } from "./distance";

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm({ latitude: 23.2, longitude: 72.6 }, { latitude: 23.2, longitude: 72.6 })).toBe(0);
  });
  it("matches a known distance (Ahmedabad to Gandhinagar ≈ 24 km)", () => {
    const d = distanceKm({ latitude: 23.0225, longitude: 72.5714 }, { latitude: 23.2156, longitude: 72.6369 });
    expect(d).toBeGreaterThan(21);
    expect(d).toBeLessThan(25);
  });
  it("is symmetric and handles the antimeridian", () => {
    const a = { latitude: 10, longitude: 179.9 };
    const b = { latitude: 10, longitude: -179.9 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 6);
    expect(distanceKm(a, b)).toBeLessThan(25);
  });
});

describe("formatDistance", () => {
  it.each([
    [0.35, "350 m"], [0.354, "350 m"], [0.999, "1.0 km"], [0.004, "0 m"], [1, "1.0 km"], [2.43, "2.4 km"], [9.96, "10.0 km"], [24.6, "25 km"], [-1, ""], [Number.NaN, ""],
  ])("%s -> %s", (km, out) => expect(formatDistance(km)).toBe(out));
});

describe("approxPoint", () => {
  it("rounds to about 1 km so a pro's exact position is never stored", () => {
    expect(APPROX_DECIMALS).toBe(2);
    expect(approxPoint({ latitude: 23.021234, longitude: 72.579876 })).toEqual({ latitude: 23.02, longitude: 72.58 });
  });
  it("keeps the point within about 1.5 km of the real one", () => {
    const real = { latitude: 23.0299, longitude: 72.5799 };
    expect(distanceKm(real, approxPoint(real)!)).toBeLessThan(1.5);
  });
  it("returns null for impossible coordinates", () => {
    expect(approxPoint({ latitude: 91, longitude: 0 })).toBeNull();
    expect(approxPoint({ latitude: 0, longitude: 181 })).toBeNull();
    expect(approxPoint({ latitude: Number.NaN, longitude: 0 })).toBeNull();
  });
});

describe("readPoint", () => {
  it("reads numbers or numeric strings (database numerics arrive as strings)", () => {
    expect(readPoint(23.02, "72.58")).toEqual({ latitude: 23.02, longitude: 72.58 });
  });
  it("is null when either value is missing or not a place on Earth", () => {
    expect(readPoint(null, 72.5)).toBeNull();
    expect(readPoint(23, undefined)).toBeNull();
    expect(readPoint("abc", 72.5)).toBeNull();
    expect(readPoint(200, 72.5)).toBeNull();
  });
});
