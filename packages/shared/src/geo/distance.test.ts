import { describe, expect, it } from "vitest";
import { distanceKm, formatDistance } from "./distance";

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
