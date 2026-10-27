import { describe, expect, it } from "vitest";
import { formatInr, roundMoney } from "./money";

describe("formatInr", () => {
  it.each([
    [0, "₹0"],
    [449, "₹449"],
    [1000, "₹1,000"],
    [100000, "₹1,00,000"],
    [1234567, "₹12,34,567"],
    [12.5, "₹12.5"],
    [12.34, "₹12.34"],
    [-1200, "-₹1,200"],
    ["349", "₹349"],
    [null, "₹0"],
    [undefined, "₹0"],
    [Number.NaN, "₹0"],
  ])("%s -> %s", (input, expected) => {
    expect(formatInr(input as number)).toBe(expected);
  });
  it("does not print a minus for values that round to zero", () => {
    expect(formatInr(-0.001)).toBe("₹0");
  });
});

describe("roundMoney", () => {
  it("rounds to paise", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});
