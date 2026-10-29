import { describe, expect, it } from "vitest";
import {
  FEATURED_MIN_RATING, isFeaturedEligible, nextBestPros, orderWithFeatured, rankProviders, sortProviders,
  type ProviderCard,
} from "./ranking";

const p = (id: string, over: Partial<ProviderCard> = {}): ProviderCard => ({
  id, price: 349, rating: 4.5, distanceKm: 3, avgResponseSeconds: 20, isOnline: true, kycApproved: true,
  city: "Gandhinagar", pincodes: ["382010"], ...over,
});
const ids = (l: readonly ProviderCard[]) => l.map((x) => x.id);

describe("rankProviders: rating, then distance, then response speed", () => {
  it("orders by rating first", () => {
    expect(ids(rankProviders([p("a", { rating: 4.1 }), p("b", { rating: 4.9 }), p("c", { rating: 4.5 })]))).toEqual(["b", "c", "a"]);
  });
  it("breaks rating ties by distance, then response speed, then id", () => {
    expect(ids(rankProviders([p("a", { distanceKm: 5 }), p("b", { distanceKm: 1 })]))).toEqual(["b", "a"]);
    expect(ids(rankProviders([p("a", { avgResponseSeconds: 40 }), p("b", { avgResponseSeconds: 10 })]))).toEqual(["b", "a"]);
    expect(ids(rankProviders([p("b"), p("a")]))).toEqual(["a", "b"]);
  });
  it("sorts missing values last and never by price", () => {
    expect(ids(rankProviders([p("a", { rating: null }), p("b", { rating: 3 })]))).toEqual(["b", "a"]);
    expect(ids(rankProviders([p("cheap", { price: 100 }), p("pricey", { price: 900 })]))).toEqual(["cheap", "pricey"]); // id tiebreak only
    expect(ids(rankProviders([p("z", { price: 100 }), p("a", { price: 900 })]))).toEqual(["a", "z"]);
  });
  it("does not mutate its input", () => {
    const input = [p("b"), p("a")];
    rankProviders(input);
    expect(ids(input)).toEqual(["b", "a"]);
  });
});

describe("ranking bands: what the customer can tell apart", () => {
  it("treats 4.74 and 4.70 as the same rating, so distance decides", () => {
    expect(ids(rankProviders([p("far", { rating: 4.74, distanceKm: 6 }), p("near", { rating: 4.7, distanceKm: 1 })]))).toEqual(["near", "far"]);
  });
  it("still puts a clearly higher rating first (0.1 apart)", () => {
    expect(ids(rankProviders([p("near", { rating: 4.6, distanceKm: 1 }), p("far", { rating: 4.8, distanceKm: 9 })]))).toEqual(["far", "near"]);
  });
  it("treats pros in the same kilometre as equally near, so response speed decides", () => {
    expect(ids(rankProviders([p("slow", { distanceKm: 1.1, avgResponseSeconds: 200 }), p("quick", { distanceKm: 1.8, avgResponseSeconds: 20 })]))).toEqual(["quick", "slow"]);
  });
  it("treats replies within 30 s as equally fast, and falls back to the exact values", () => {
    expect(ids(rankProviders([p("b", { avgResponseSeconds: 25 }), p("a", { avgResponseSeconds: 5 })]))).toEqual(["a", "b"]);
  });
  it("is stable for identical cards and ignores money entirely", () => {
    expect(ids(rankProviders([p("b", { price: 100 }), p("a", { price: 900 })]))).toEqual(["a", "b"]);
  });
  it("copes with missing numbers and NaN (sorted last)", () => {
    expect(ids(rankProviders([p("x", { rating: Number.NaN }), p("y", { rating: 4 }), p("z", { rating: null })]))).toEqual(["y", "x", "z"]);
  });
  it("top rated groups by displayed rating and then uses distance", () => {
    expect(ids(sortProviders([p("far", { rating: 4.74, distanceKm: 8 }), p("near", { rating: 4.7, distanceKm: 1 })], "top_rated"))).toEqual(["near", "far"]);
  });
});

describe("sortProviders (customer choice)", () => {
  const list = [
    p("a", { price: 429, rating: 4.9, distanceKm: 6 }),
    p("b", { price: 299, rating: 4.7, distanceKm: 2 }),
    p("c", { price: 349, rating: 4.8, distanceKm: 4 }),
  ];
  it("cheapest", () => expect(ids(sortProviders(list, "cheapest"))).toEqual(["b", "c", "a"]));
  it("top rated", () => expect(ids(sortProviders(list, "top_rated"))).toEqual(["a", "c", "b"]));
  it("nearest", () => expect(ids(sortProviders(list, "nearest"))).toEqual(["b", "c", "a"]));
  it("falls back to ranking on ties", () => {
    const tie = [p("x", { price: 300, rating: 4.0 }), p("y", { price: 300, rating: 4.8 })];
    expect(ids(sortProviders(tie, "cheapest"))).toEqual(["y", "x"]);
  });
});

describe("featured slots", () => {
  it("requires KYC approval and a 4.3+ rating", () => {
    expect(isFeaturedEligible(p("a", { rating: FEATURED_MIN_RATING }))).toBe(true);
    expect(isFeaturedEligible(p("a", { rating: 4.29 }))).toBe(false);
    expect(isFeaturedEligible(p("a", { kycApproved: false }))).toBe(false);
    expect(isFeaturedEligible(p("a", { rating: null }))).toBe(false);
  });
  it("shows at most 2 featured pros, then everyone else by rank", () => {
    const list = [p("a", { rating: 4.9 }), p("b", { rating: 4.8 }), p("c", { rating: 4.7 }), p("d", { rating: 4.0 })];
    const { featured, rest } = orderWithFeatured(list, new Set(["c", "b", "d", "a"]));
    expect(ids(featured)).toEqual(["a", "b"]);
    expect(ids(rest)).toEqual(["c", "d"]);
  });
  it("silently drops ineligible paid slots", () => {
    const list = [p("a", { rating: 4.0 }), p("b", { rating: 4.5 })];
    const { featured, rest } = orderWithFeatured(list, new Set(["a"]));
    expect(featured).toEqual([]);
    expect(ids(rest)).toEqual(["b", "a"]);
  });
});

describe("nextBestPros (after a decline or 30 s timeout)", () => {
  const base = { requestedPrice: 349, pincode: "382010", city: "Gandhinagar", excludeIds: new Set(["declined"]) };
  it("offers same-area, similar-price, online pros and never the one already tried", () => {
    const candidates = [
      p("declined"),
      p("ok1", { rating: 4.9 }),
      p("ok2", { rating: 4.2, price: 399 }),
      p("pricey", { price: 700 }),
      p("cheap", { price: 100 }),
      p("offline", { isOnline: false }),
      p("far", { pincodes: ["110001"], city: "Delhi" }),
      p("unverified", { kycApproved: false }),
    ];
    expect(ids(nextBestPros({ ...base, candidates }))).toEqual(["ok1", "ok2"]);
  });
  it("matches the area by city when the pincode isn't listed", () => {
    expect(ids(nextBestPros({ ...base, candidates: [p("c", { pincodes: [], city: "gandhinagar " })] }))).toEqual(["c"]);
  });
  it("limits to 3 best by default", () => {
    const candidates = ["a", "b", "c", "d", "e"].map((id, i) => p(id, { rating: 4.0 + i / 10 }));
    expect(ids(nextBestPros({ ...base, candidates }))).toEqual(["e", "d", "c"]);
    expect(nextBestPros({ ...base, candidates, limit: 1 })).toHaveLength(1);
  });
  it("returns nothing when no one qualifies (caller shows 'no pros nearby')", () => {
    expect(nextBestPros({ ...base, candidates: [p("declined")] })).toEqual([]);
  });
});
