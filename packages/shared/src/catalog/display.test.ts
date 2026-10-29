import { describe, expect, it } from "vitest";
import { formatDuration, formatRating, priceRangeLabel, serviceEmoji } from "./display";

describe("serviceEmoji", () => {
  it("maps the catalogue icon names and falls back for unknown ones", () => {
    expect(serviceEmoji("Wrench")).toBe("🔧");
    expect(serviceEmoji("Scissors")).toBe("✂️");
    for (const v of [null, undefined, "", "Nope"]) expect(serviceEmoji(v)).toBe("🛠️");
  });
});

describe("formatDuration", () => {
  it.each([[45, "45 min"], [60, "1 hr"], [90, "1 hr 30 min"], [240, "4 hr"], [59.6, "1 hr"]])("%s -> %s", (m, out) =>
    expect(formatDuration(m)).toBe(out));
  it.each([0, -5, Number.NaN, null, undefined])("is blank for %s", (m) => expect(formatDuration(m as number)).toBe(""));
});

describe("formatRating", () => {
  it("shows one decimal, or New", () => {
    expect(formatRating(4.66)).toBe("4.7");
    expect(formatRating(5)).toBe("5.0");
    for (const v of [0, null, undefined, Number.NaN]) expect(formatRating(v as number)).toBe("New");
  });
});

describe("priceRangeLabel", () => {
  it("shows the admin band as a range", () => {
    expect(priceRangeLabel(249, 449)).toBe("₹249–₹449");
    expect(priceRangeLabel("249.00", "449.00")).toBe("₹249–₹449");
    expect(priceRangeLabel(1000, 25000)).toBe("₹1,000–₹25,000");
  });
  it("shows nothing for a missing, half-set or single-price band", () => {
    for (const [lo, hi] of [[null, null], [249, null], [null, 449], ["", ""], [undefined, 449]] as const) expect(priceRangeLabel(lo, hi)).toBeNull();
    expect(priceRangeLabel(349, 349)).toBeNull();
    expect(priceRangeLabel(449, 249)).toBeNull();
  });
  it("shows nothing for zero, negative or unreadable numbers", () => {
    for (const [lo, hi] of [[0, 100], [-5, 100], ["abc", 100], [10, "x"], [Number.NaN, 100], [10, Number.POSITIVE_INFINITY]] as const) expect(priceRangeLabel(lo, hi)).toBeNull();
  });
});
