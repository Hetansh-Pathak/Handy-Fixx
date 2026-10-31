import { describe, expect, it } from "vitest";
import { distanceKm, type LatLng } from "../geo/distance";
import { dispatchEligibility, offerAccess, orderForOffers, type DispatchCandidate } from "./eligibility";
import { isOfferOpen, offerTransition, offerView, readOfferStatus, type OfferStatus } from "./offer";
import { extendSearchClock, isInCity, newSearchClock, ringForDistance, tickSearch, type SearchClock } from "./ring-plan";
import {
  approxDistanceLine, confirmButtonLabel, dispatchPrice, elapsedLabel, foundBadge, jitteredPoint, notifiedLine,
  outsideCityMessage, readDispatchState, searchStatusText, searchTransition, stageChips,
} from "./search";
import { DEFAULT_DISPATCH_SETTINGS as S, parseDispatchSettings, ringCount } from "./settings";

const T0 = new Date("2026-10-31T10:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);
/** A point `km` north of `p` (1 degree of latitude is about 111.2 km). */
const north = (p: LatLng, km: number): LatLng => ({ latitude: p.latitude + km / 111.195, longitude: p.longitude });
const CUSTOMER = S.city.centre;

describe("settings", () => {
  it("defaults: 2/5/10 km rings of 10 s, then all of Jamnagar until 120 s", () => {
    expect(S.rings.map((r) => r.radiusKm)).toEqual([2, 5, 10]);
    expect(S.rings.every((r) => r.waitSeconds === 10)).toBe(true);
    expect(S.city).toMatchObject({ name: "Jamnagar", radiusKm: 20 });
    expect(S.maxSearchSeconds).toBe(120);
    expect(ringCount(S)).toBe(4);
  });
  it("reads the database row, numerics as strings included", () => {
    const s = parseDispatchSettings({ ring_radii_km: ["1", 3, 8], ring_wait_seconds: [5, 5, 5], max_search_seconds: "90", city_name: "Rajkot", city_lat: "22.3", city_lng: 70.8, city_radius_km: 15 });
    expect(s.rings).toEqual([{ radiusKm: 1, waitSeconds: 5 }, { radiusKm: 3, waitSeconds: 5 }, { radiusKm: 8, waitSeconds: 5 }]);
    expect(s.city).toEqual({ name: "Rajkot", centre: { latitude: 22.3, longitude: 70.8 }, radiusKm: 15 });
    expect(s.maxSearchSeconds).toBe(90);
  });
  it("a bad row never stops dispatch: shrinking radii, zero or missing values fall back to the defaults", () => {
    expect(parseDispatchSettings({ ring_radii_km: [5, 2] }).rings).toEqual(S.rings);
    expect(parseDispatchSettings({ max_search_seconds: 0, city_radius_km: -1 })).toMatchObject({ maxSearchSeconds: 120, city: { radiusKm: 20 } });
    expect(parseDispatchSettings(null)).toBe(S);
  });
});

describe("ring of a pro", () => {
  it("first ring that covers the distance, edges included", () => {
    expect(ringForDistance(S, 0.4, true)).toBe(1);
    expect(ringForDistance(S, 2, true)).toBe(1);
    expect(ringForDistance(S, 2.01, true)).toBe(2);
    expect(ringForDistance(S, 9.9, true)).toBe(3);
  });
  it("beyond 10 km: the city ring if the pro is inside Jamnagar, otherwise never offered", () => {
    expect(ringForDistance(S, 14, true)).toBe(4);
    expect(ringForDistance(S, 14, false)).toBeNull();
    expect(ringForDistance(S, Number.NaN, true)).toBeNull();
  });
  it("the city zone is a circle around the centre", () => {
    expect(isInCity(S, north(S.city.centre, 19))).toBe(true);
    expect(isInCity(S, north(S.city.centre, 21))).toBe(false);
    expect(isInCity(S, { latitude: 23.0225, longitude: 72.5714 })).toBe(false); // Ahmedabad
  });
});

describe("ring plan (server tick)", () => {
  const start = newSearchClock(S, T0);
  const run = (clock: SearchClock, now: Date, adds: Record<number, number>, openOffers = 0) =>
    tickSearch({ settings: S, clock, now, newPros: (r) => adds[r] ?? 0, openOffers });

  it("opens ring 1 first and waits 10 s", () => {
    const r = run(start, T0, { 1: 2, 2: 1, 4: 3 });
    expect(r).toMatchObject({ kind: "opened", skipped: [], clock: { ring: 1, ringDeadline: at(10) } });
    if (r.kind !== "opened") throw new Error();
    expect(run(r.clock, at(9), {}, 2)).toEqual({ kind: "wait", clock: r.clock });
  });
  it("widens after the wait; earlier offers stay open (cumulative)", () => {
    const ring1: SearchClock = { ring: 1, ringDeadline: at(10), endsAt: at(120) };
    expect(run(ring1, at(10), { 2: 1 }, 2)).toMatchObject({ kind: "opened", clock: { ring: 2, ringDeadline: at(20) } });
  });
  it("skips rings that add nobody, without waiting", () => {
    expect(run(start, T0, { 1: 0, 2: 0, 3: 1 })).toMatchObject({ kind: "opened", skipped: [1, 2], clock: { ring: 3, ringDeadline: at(10) } });
    expect(run(start, T0, { 4: 1 })).toMatchObject({ kind: "opened", skipped: [1, 2, 3], clock: { ring: 4, ringDeadline: null } });
  });
  it("the city ring stays open until the search ends, then: no pro", () => {
    const city: SearchClock = { ring: 4, ringDeadline: null, endsAt: at(120) };
    expect(run(city, at(119), {}, 3)).toEqual({ kind: "wait", clock: city });
    expect(run(city, at(120), {}, 3)).toEqual({ kind: "no_pro", reason: "time_up" });
  });
  it("nobody online at all: no pro straight away (customer can schedule instead)", () => {
    expect(run(start, T0, {})).toEqual({ kind: "no_pro", reason: "nobody_online" });
  });
  it("later rings empty but earlier pros still deciding: keep the search open on the city ring", () => {
    const ring1: SearchClock = { ring: 1, ringDeadline: at(10), endsAt: at(120) };
    expect(run(ring1, at(10), {}, 1)).toMatchObject({ kind: "opened", skipped: [2, 3], clock: { ring: 4, ringDeadline: null } });
  });
  it("only one pro in the whole city: the search reaches them on the city ring", () => {
    expect(run(start, T0, { 4: 1 })).toMatchObject({ kind: "opened", clock: { ring: 4 } });
  });
  it("keep looking: city ring for 10 more minutes", () => {
    expect(extendSearchClock(S, at(130))).toEqual({ ring: 4, ringDeadline: null, endsAt: at(730) });
  });
});

const pro = (over: Partial<DispatchCandidate> = {}): DispatchCandidate => ({
  providerId: "p1", kycStatus: "approved", status: "active", isOnline: true, heartbeatAt: at(-30), serviceIds: ["s-plumb"],
  location: north(CUSTOMER, 1.5), rating: 4.6, ...over,
});
const elig = (c: DispatchCandidate) => dispatchEligibility(c, { serviceId: "s-plumb", customer: CUSTOMER, settings: S, now: T0 });

describe("eligibility", () => {
  it("an approved, active, online pro with a fresh heartbeat who offers the service is eligible, with ring and distance", () => {
    const e = elig(pro());
    expect(e).toMatchObject({ ok: true, ring: 1 });
    if (e.ok) expect(e.distanceKm).toBeCloseTo(1.5, 1);
  });
  it.each([
    ["kyc", { kycStatus: "pending" }],
    ["inactive", { status: "suspended" }],
    ["offline", { isOnline: false }],
    ["stale", { heartbeatAt: at(-91) }],
    ["stale", { heartbeatAt: null }],
    ["no_service", { serviceIds: ["s-elec"] }],
    ["no_service", { serviceIds: null }],
    ["no_location", { location: null }],
    ["too_far", { location: { latitude: 23.0225, longitude: 72.5714 } }],
  ] as const)("not eligible: %s", (reason, over) => {
    expect(elig(pro(over))).toEqual({ ok: false, reason });
  });
  it("a pro 15 km away inside Jamnagar is in the city ring", () => {
    expect(elig(pro({ location: north(CUSTOMER, 15) }))).toMatchObject({ ok: true, ring: 4 });
  });
  it("orders by distance, then rating, never by money", () => {
    const list = [
      { providerId: "far", distanceKm: 1.8, rating: 5 },
      { providerId: "near-low", distanceKm: 0.6, rating: 3.9 },
      { providerId: "near-high", distanceKm: 0.6, rating: 4.8 },
      { providerId: "near-none", distanceKm: 0.6, rating: null },
    ];
    expect(orderForOffers(list).map((p) => p.providerId)).toEqual(["near-high", "near-low", "near-none", "far"]);
  });
});

describe("wallet on the offer card", () => {
  it("enough balance: Accept, with the 3% fee", () => {
    const a = offerAccess({ wallet: { balance: 100, due: 0 }, price: 349, launchActive: false });
    expect(a).toEqual({ canAccept: true, fee: 10, feeWaived: false });
    expect(offerView("offered", a)).toMatchObject({ kind: "accept", button: "Accept" });
  });
  it("too low: the offer is shown as 'Top up ₹49 to accept', not hidden", () => {
    const a = offerAccess({ wallet: { balance: 3, due: 0 }, price: 349, launchActive: false });
    expect(a).toMatchObject({ canAccept: false, fee: 10 });
    expect(offerView("offered", a)).toMatchObject({ kind: "top_up", button: "Top up ₹49 to accept" });
  });
  it("launch period: fee waived, even with an empty wallet", () => {
    const a = offerAccess({ wallet: { balance: 0, due: 0 }, price: 349, launchActive: true });
    expect(a).toMatchObject({ canAccept: true, feeWaived: true });
    expect(offerView("offered", a)).toMatchObject({ kind: "accept", feeLine: "HandyFix fee waived (launch period)" });
  });
});

describe("offer state machine", () => {
  it("an open offer can be won, taken, expired or withdrawn, exactly once", () => {
    expect(offerTransition("offered", "accept_won")).toBe("accepted");
    expect(offerTransition("offered", "other_won")).toBe("taken");
    expect(offerTransition("offered", "search_ended")).toBe("expired");
    expect(offerTransition("offered", "customer_cancelled")).toBe("withdrawn");
    const closed: OfferStatus[] = ["accepted", "taken", "expired", "withdrawn"];
    for (const s of closed) for (const e of ["accept_won", "other_won", "search_ended", "customer_cancelled"] as const) expect(offerTransition(s, e)).toBeNull();
  });
  it("closed offers show plain words on the pro's card", () => {
    const a = offerAccess({ wallet: { balance: 100, due: 0 }, price: 349, launchActive: false });
    expect(offerView("taken", a)).toEqual({ kind: "taken", message: "Taken by another pro" });
    expect(offerView("expired", a)).toEqual({ kind: "expired", message: "Expired" });
    expect(offerView("accepted", a).kind).toBe("accepted");
    expect(isOfferOpen("offered")).toBe(true);
    expect(isOfferOpen("taken")).toBe(false);
    expect(readOfferStatus("weird")).toBe("expired");
  });
});

describe("customer search state", () => {
  it("searching ends assigned, no pro or cancelled; no pro can keep looking or cancel", () => {
    expect(searchTransition("searching", "accepted")).toBe("assigned");
    expect(searchTransition("searching", "time_up")).toBe("no_pro");
    expect(searchTransition("searching", "customer_cancelled")).toBe("cancelled");
    expect(searchTransition("no_pro", "keep_looking")).toBe("searching");
    expect(searchTransition("no_pro", "customer_cancelled")).toBe("cancelled");
  });
  it("refuses the edge cases: accept after cancel, accept after the search ended, double cancel", () => {
    expect(searchTransition("cancelled", "accepted")).toBeNull();
    expect(searchTransition("no_pro", "accepted")).toBeNull();
    expect(searchTransition("assigned", "accepted")).toBeNull();
    expect(searchTransition("cancelled", "customer_cancelled")).toBeNull();
    expect(searchTransition("searching", "keep_looking")).toBeNull();
    expect(readDispatchState("searching")).toBe("searching");
    expect(readDispatchState(null)).toBeNull();
  });
  it("status text follows the open ring", () => {
    expect(searchStatusText(S, 0)).toBe("Asking pros within 2 km");
    expect(searchStatusText(S, 1)).toBe("Asking pros within 2 km");
    expect(searchStatusText(S, 2)).toBe("Widening to 5 km");
    expect(searchStatusText(S, 3)).toBe("Widening to 10 km");
    expect(searchStatusText(S, 4)).toBe("Asking all pros in Jamnagar");
  });
  it("three stage chips: done / active / pending", () => {
    expect(stageChips(S, 1)).toEqual([
      { label: "2 km", state: "active" }, { label: "5-10 km", state: "pending" }, { label: "Jamnagar", state: "pending" },
    ]);
    expect(stageChips(S, 3).map((c) => c.state)).toEqual(["done", "active", "pending"]);
    expect(stageChips(S, 4).map((c) => c.state)).toEqual(["done", "done", "active"]);
  });
  it("sheet lines", () => {
    expect(notifiedLine(1)).toBe("1 pro notified. The first to accept gets your job. No charge for cancelling.");
    expect(notifiedLine(5)).toBe("5 pros notified. The first to accept gets your job. No charge for cancelling.");
    expect(notifiedLine(0)).toMatch(/No charge for cancelling/);
    expect(elapsedLabel(38)).toBe("0:38");
    expect(elapsedLabel(125)).toBe("2:05");
    expect(foundBadge(38)).toBe("Pro found in 38 s");
    expect(foundBadge(65)).toBe("Pro found in 1 min 5 s");
    expect(foundBadge(120)).toBe("Pro found in 2 min");
    expect(outsideCityMessage(S)).toMatch(/Jamnagar/);
  });
});

describe("price: one catalogue price for everyone", () => {
  it("job price, else service price; platform fee 0; the pro's own rate plays no part", () => {
    expect(dispatchPrice({ subItemPrice: 349, basePrice: 299 })).toEqual({ price: 349, platformFee: 0 });
    expect(dispatchPrice({ subItemPrice: null, basePrice: "299" })).toEqual({ price: 299, platformFee: 0 });
    expect(dispatchPrice({ subItemPrice: 0, basePrice: null })).toBeNull();
    expect(confirmButtonLabel(349)).toBe("Find a pro · ₹349");
  });
});

describe("privacy", () => {
  it("a pro's dot is vague (about 1 km rounding plus a few hundred metres) but stable for the same booking and pro", () => {
    const exact = north(CUSTOMER, 1.234);
    const a = jitteredPoint(exact, "b1:p1");
    const b = jitteredPoint(exact, "b1:p1");
    const c = jitteredPoint(exact, "b1:p2");
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    if (!a) throw new Error();
    const off = distanceKm(exact, a);
    expect(off).toBeGreaterThan(0.05);
    expect(off).toBeLessThan(1.2);
    expect(jitteredPoint({ latitude: Number.NaN, longitude: 0 }, "x")).toBeNull();
  });
  it("the offer card says 'about N km away', to the nearest half km", () => {
    expect(approxDistanceLine(CUSTOMER, north(CUSTOMER, 1.3))).toBe("about 1.5 km away");
    expect(approxDistanceLine(CUSTOMER, north(CUSTOMER, 0.1))).toBe("about 500 m away");
  });
});
