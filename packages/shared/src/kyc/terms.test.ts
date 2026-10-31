import { describe, expect, it } from "vitest";
import { TERMS_VERSION } from "./kyc";
import { FEE_MAX, FEE_MIN, FEE_RATE } from "../money/fee";
import { LAUNCH_PERIOD } from "../money/launch";
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

  it("states the current fee rule and launch period, not the old slabs or the 12% fee", () => {
    expect(all).toContain(`${Math.round(FEE_RATE * 100)}% of the service bill`);
    expect(all).toContain(`₹${FEE_MIN}`);
    expect(all).toContain(`₹${FEE_MAX}`);
    expect(LAUNCH_PERIOD.months).toBe(1); // the wording below says "first month"
    expect(all).toContain(`first ${LAUNCH_PERIOD.jobs} jobs or first month `);
    expect(all).not.toContain("₹15");
    expect(all).not.toMatch(/12\s?%/);
    expect(all).not.toMatch(/\bQR\b/);
  });

  it("is a new version, because the data wording changed (no Aadhaar, encrypted PAN)", () => {
    expect(TERMS_VERSION).toBe("v1.3");
  });

  it("does not ask for Aadhaar and says the PAN is stored encrypted", () => {
    expect(all).toContain("We do not collect your Aadhaar card or number");
    expect(all).toContain("stored encrypted");
    expect(all.match(/Aadhaar/g)?.length).toBe(1);
  });
});
