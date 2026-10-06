import { describe, it, expect } from "vitest";
import { isFresh, servesArea } from "@/lib/serviceArea";

describe("servesArea", () => {
  it("matches a city name case-insensitively", () => expect(servesArea(["Ahmedabad"], "ahmedabad")).toBe(true));
  it("a pincode matches via the customer's saved city", () => {
    expect(servesArea(["Ahmedabad"], "380001", "Ahmedabad")).toBe(true);
    expect(servesArea(["Surat"], "380001", "Ahmedabad")).toBe(false);
  });
  it("an unresolvable pincode shows providers instead of hiding everyone", () => expect(servesArea(["Surat"], "380001")).toBe(true));
  it("a provider listing a pincode directly matches it", () => expect(servesArea(["380001"], "380001")).toBe(true));
  it("a city the provider does not serve is excluded; empty query matches all", () => {
    expect(servesArea(["Surat"], "Rajkot")).toBe(false);
    expect(servesArea([], "")).toBe(true);
  });
});
describe("isFresh", () => {
  const now = Date.parse("2026-10-05T10:00:00Z");
  it("accepts a recent heartbeat, rejects an old one, trusts a missing value", () => {
    expect(isFresh("2026-10-05T09:59:00Z", now)).toBe(true);
    expect(isFresh("2026-10-05T09:50:00Z", now)).toBe(false);
    expect(isFresh(null, now)).toBe(true);
  });
});
