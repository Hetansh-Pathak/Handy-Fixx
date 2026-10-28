import { describe, expect, it } from "vitest";
import { quoteBooking, reconcileQuote, resolveListedPrice } from "./pricing";

describe("resolveListedPrice", () => {
  it("a chosen sub-item's catalogue price wins for every pro", () => {
    expect(resolveListedPrice({ subItemPrice: 199, customPrice: 349, basePrice: 299 })).toBe(199);
  });
  it("the pro's own rate for the chosen job beats its catalogue price", () => {
    expect(resolveListedPrice({ proSubItemPrice: 249, subItemPrice: 199, customPrice: 349, basePrice: 299 })).toBe(249);
    expect(resolveListedPrice({ proSubItemPrice: null, subItemPrice: 199 })).toBe(199);
  });
  it("a job rate without a chosen job is ignored", () => {
    expect(resolveListedPrice({ proSubItemPrice: 249, basePrice: 299 })).toBe(299);
  });
  it("otherwise the pro's own rate, then the service's starting price", () => {
    expect(resolveListedPrice({ customPrice: 349, basePrice: 299 })).toBe(349);
    expect(resolveListedPrice({ customPrice: null, basePrice: 299 })).toBe(299);
  });
  it("ignores zero, negative and invalid values and can return null", () => {
    expect(resolveListedPrice({ subItemPrice: 0, customPrice: -5, basePrice: 299 })).toBe(299);
    expect(resolveListedPrice({ customPrice: Number.NaN, basePrice: null })).toBeNull();
    expect(resolveListedPrice({})).toBeNull();
  });
});

describe("quoteBooking (PDF: price shown = price paid, ₹0 platform fee)", () => {
  it("the customer total equals the pro's price", () => {
    expect(quoteBooking(349)).toEqual({ servicePrice: 349, platformFee: 0, total: 349 });
  });
  it("rounds to paise", () => {
    expect(quoteBooking(299.999)).toEqual({ servicePrice: 300, platformFee: 0, total: 300 });
  });
});

describe("reconcileQuote", () => {
  const quote = quoteBooking(349);
  it("matches when the database saved exactly the quote (numbers or numeric strings)", () => {
    expect(reconcileQuote(quote, { provider_amount: 349, platform_fee: 0, total_amount: 349 })).toEqual({ matches: true });
    expect(reconcileQuote(quote, { provider_amount: "349.00", platform_fee: "0.00", total_amount: "349.00" })).toEqual({ matches: true });
  });
  it("detects the legacy 12% trigger overwriting the price (₹349 became ₹391)", () => {
    expect(reconcileQuote(quote, { provider_amount: 349, platform_fee: 42, total_amount: 391 }))
      .toEqual({ matches: false, expectedTotal: 349, storedTotal: 391, storedFee: 42 });
  });
  it("detects a different price even with a zero fee", () => {
    expect(reconcileQuote(quote, { total_amount: 299, platform_fee: 0 }))
      .toEqual({ matches: false, expectedTotal: 349, storedTotal: 299, storedFee: 0 });
  });
  it("treats missing values as zero (so an empty row never looks like a match)", () => {
    expect(reconcileQuote(quote, {})).toMatchObject({ matches: false, storedTotal: 0 });
    expect(reconcileQuote(quote, { total_amount: "abc" })).toMatchObject({ matches: false, storedTotal: 0 });
  });
});
