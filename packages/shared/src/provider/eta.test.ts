import { describe, expect, it } from "vitest";
import { estimateEtaMinutes } from "./eta";

describe("estimateEtaMinutes", () => {
  it.each([[0, 1], [0.1, 1], [2.4, 6], [12.5, 30], [25, 60]])("%s km -> %s min", (km, min) => expect(estimateEtaMinutes(km)).toBe(min));
  it("accepts a custom speed", () => expect(estimateEtaMinutes(10, 50)).toBe(12));
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("returns null for distance %s", (km) => expect(estimateEtaMinutes(km)).toBeNull());
  it.each([0, -5, Number.NaN])("returns null for speed %s", (speed) => expect(estimateEtaMinutes(5, speed)).toBeNull());
});
