import { describe, expect, it } from "vitest";
import { checkOwnRate, groupProOffers, offerRowsForService, offersSubItem, ownSubItemRate, readBand } from "./pro-offers";

const offers = groupProOffers([
  { provider_id: "p1", sub_item_id: "leak", custom_price: "349.00" },
  { provider_id: "p1", sub_item_id: "tap", custom_price: null },
  { provider_id: "p2", sub_item_id: "tap", custom_price: 0 },
]);

describe("offersSubItem", () => {
  it("a pro who ticked jobs only gets those jobs", () => {
    expect(offersSubItem(offers, "p1", "leak")).toBe(true);
    expect(offersSubItem(offers, "p1", "toilet")).toBe(false);
    expect(offersSubItem(offers, "p2", "leak")).toBe(false);
  });
  it("a pro with nothing ticked in this service does every job (older pros stay visible)", () => {
    expect(offersSubItem(offers, "p3", "leak")).toBe(true);
    expect(offersSubItem(groupProOffers([]), "p1", "leak")).toBe(true);
  });
  it("no job chosen by the customer matches every pro", () => {
    expect(offersSubItem(offers, "p1", null)).toBe(true);
  });
});

describe("ownSubItemRate", () => {
  const band = { min: 249, max: 449 };
  it("returns the pro's rate as a number, null for HandyFix price, zero or unknown", () => {
    expect(ownSubItemRate(offers, "p1", "leak", band)).toBe(349);
    expect(ownSubItemRate(offers, "p1", "tap", band)).toBeNull();
    expect(ownSubItemRate(offers, "p2", "tap", band)).toBeNull();
    expect(ownSubItemRate(offers, "p9", "leak", band)).toBeNull();
    expect(ownSubItemRate(offers, "p1", null, band)).toBeNull();
  });
  it("ignores a rate outside the current band or when the band was removed (same as the database)", () => {
    expect(ownSubItemRate(offers, "p1", "leak", { min: 149, max: 299 })).toBeNull();
    expect(ownSubItemRate(offers, "p1", "leak", { min: null, max: null })).toBeNull();
  });
});

describe("readBand", () => {
  it("needs both ends, positive and in order", () => {
    expect(readBand({ min: "249", max: 449 })).toEqual({ min: 249, max: 449 });
    expect(readBand({ min: 249, max: null })).toBeNull();
    expect(readBand({ min: 500, max: 400 })).toBeNull();
    expect(readBand({ min: 0, max: 400 })).toBeNull();
  });
});

describe("checkOwnRate", () => {
  const band = { min: 249, max: 449 };
  it("blank means the HandyFix price", () => {
    expect(checkOwnRate("  ", band)).toEqual({ ok: true, price: null });
    expect(checkOwnRate("", { min: null, max: null })).toEqual({ ok: true, price: null });
  });
  it("accepts whole rupees inside the band, with ₹ or commas", () => {
    expect(checkOwnRate("349", band)).toEqual({ ok: true, price: 349 });
    expect(checkOwnRate("₹ 449", band)).toEqual({ ok: true, price: 449 });
    expect(checkOwnRate("1,200", { min: 1000, max: 1500 })).toEqual({ ok: true, price: 1200 });
  });
  it("refuses decimals, words, prices outside the band and jobs without a band", () => {
    expect(checkOwnRate("349.5", band)).toEqual({ ok: false, error: "Enter whole rupees, for example 349." });
    expect(checkOwnRate("abc", band).ok).toBe(false);
    expect(checkOwnRate("500", band)).toEqual({ ok: false, error: "Set a price between ₹249 and ₹449." });
    expect(checkOwnRate("200", band).ok).toBe(false);
    expect(checkOwnRate("300", { min: null, max: null })).toEqual({ ok: false, error: "HandyFix has not set a price range for this job yet." });
  });
});

describe("offerRowsForService", () => {
  const subItemIds = ["a", "b", "c"];
  it("stores nothing when every job is ticked at the HandyFix price", () => {
    expect(offerRowsForService({ subItemIds, ticked: new Set(subItemIds), rates: new Map() })).toEqual([]);
  });
  it("stores the ticked jobs when some are left out", () => {
    expect(offerRowsForService({ subItemIds, ticked: new Set(["a", "c"]), rates: new Map() })).toEqual([
      { subItemId: "a", customPrice: null },
      { subItemId: "c", customPrice: null },
    ]);
  });
  it("stores every ticked job when any has an own rate, ignoring rates on unticked jobs", () => {
    expect(offerRowsForService({ subItemIds, ticked: new Set(subItemIds), rates: new Map([["b", 399], ["x", 1]]) })).toEqual([
      { subItemId: "a", customPrice: null },
      { subItemId: "b", customPrice: 399 },
      { subItemId: "c", customPrice: null },
    ]);
  });
  it("ignores ticks for jobs no longer in the catalogue", () => {
    expect(offerRowsForService({ subItemIds, ticked: new Set(["a", "gone"]), rates: new Map() })).toEqual([{ subItemId: "a", customPrice: null }]);
  });
});
