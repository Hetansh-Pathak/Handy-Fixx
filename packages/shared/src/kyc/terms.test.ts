import { describe, expect, it } from "vitest";
import { TERMS_VERSION } from "./kyc";
import { PARTNER_TERMS } from "./terms";

describe("partner terms", () => {
  const all = PARTNER_TERMS.map((s) => `${s.heading} ${s.body}`).join("\n");

  it("has numbered sections with text", () => {
    expect(PARTNER_TERMS.length).toBeGreaterThanOrEqual(8);
    PARTNER_TERMS.forEach((s, i) => {
      expect(s.heading.startsWith(`${i + 1}.`)).toBe(true);
      expect(s.body.length).toBeGreaterThan(40);
    });
  });

  it("states the flat fee model, not the old percentage fee", () => {
    expect(all).toContain("₹15");
    expect(all).toContain("₹30");
    expect(all).toContain("₹50");
    expect(all).not.toMatch(/12\s?%/);
    expect(all).not.toMatch(/\bQR\b/);
  });

  it("is a new version, because the fee wording changed", () => {
    expect(TERMS_VERSION).toBe("v1.1");
  });
});
