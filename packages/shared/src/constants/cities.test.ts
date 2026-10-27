import { describe, expect, it } from "vitest";
import { GUJARAT_CITIES } from "./cities";

describe("GUJARAT_CITIES", () => {
  it("has no duplicates or blanks", () => {
    expect(new Set(GUJARAT_CITIES).size).toBe(GUJARAT_CITIES.length);
    expect(GUJARAT_CITIES.every((c) => c.trim() === c && c.length > 1)).toBe(true);
  });
  it("includes the launch cities", () => {
    for (const c of ["Ahmedabad", "Gandhinagar", "Surat", "Vadodara", "Rajkot"]) expect(GUJARAT_CITIES).toContain(c);
  });
});
