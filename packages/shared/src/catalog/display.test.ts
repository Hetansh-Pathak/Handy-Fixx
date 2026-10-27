import { describe, expect, it } from "vitest";
import { formatDuration, formatRating, serviceEmoji } from "./display";

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
