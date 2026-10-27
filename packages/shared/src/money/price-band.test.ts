import { describe, expect, it } from "vitest";
import { checkRate, clampToBand, describeRateError, isValidBand } from "./price-band";

const band = { min: 249, max: 449 }; // leak repair example, PDF p.3

describe("checkRate", () => {
  it("accepts rates inside the band, bounds included", () => {
    expect(checkRate(249, band)).toEqual({ ok: true });
    expect(checkRate(349, band)).toEqual({ ok: true });
    expect(checkRate(449, band)).toEqual({ ok: true });
  });
  it("blocks rates outside the band", () => {
    expect(checkRate(248, band)).toEqual({ ok: false, reason: "below_min" });
    expect(checkRate(450, band)).toEqual({ ok: false, reason: "above_max" });
  });
  it("rejects nonsense input and broken bands", () => {
    expect(checkRate(Number.NaN, band)).toEqual({ ok: false, reason: "invalid" });
    expect(checkRate(0, band)).toEqual({ ok: false, reason: "invalid" });
    expect(checkRate(300, { min: 500, max: 100 })).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("band helpers", () => {
  it("validates bands", () => {
    expect(isValidBand(band)).toBe(true);
    expect(isValidBand({ min: 0, max: 10 })).toBe(false);
    expect(isValidBand({ min: 10, max: 5 })).toBe(false);
  });
  it("clamps into the band", () => {
    expect(clampToBand(100, band)).toBe(249);
    expect(clampToBand(900, band)).toBe(449);
    expect(clampToBand(300, band)).toBe(300);
    expect(() => clampToBand(300, { min: 5, max: 1 })).toThrow();
  });
  it("gives readable errors", () => {
    expect(describeRateError(checkRate(100, band), band)).toBe("Rate cannot be below ₹249.");
    expect(describeRateError(checkRate(500, band), band)).toBe("Rate cannot be above ₹449.");
    expect(describeRateError(checkRate(300, band), band)).toBeNull();
  });
});
