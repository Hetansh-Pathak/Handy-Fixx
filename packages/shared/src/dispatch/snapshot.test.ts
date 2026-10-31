import { describe, expect, it } from "vitest";
import { distanceKm, type LatLng } from "../geo/distance";
import { DEFAULT_DISPATCH_SETTINGS as S } from "./settings";
import { etaLine, mapFraction, mapOffset, matchSeconds, readSearchSnapshot, ringFractions, searchElapsedSeconds } from "./snapshot";

const C: LatLng = S.city.centre;
const north = (km: number): LatLng => ({ latitude: C.latitude + km / 111.195, longitude: C.longitude });
const east = (km: number): LatLng => ({ latitude: C.latitude, longitude: C.longitude + km / (111.195 * Math.cos((C.latitude * Math.PI) / 180)) });

const raw = {
  booking_id: "b1", dispatch_state: "searching", status: "pending", current_ring: "2",
  searched_since: "2026-10-31T10:00:00Z", search_ends_at: "2026-10-31T10:02:00Z", accepted_at: null, now: "2026-10-31T10:00:15Z",
  notified: "3", dots: [{ key: "k1", lat: "22.48", lng: "70.06" }, { key: "bad", lat: null, lng: 70 }],
  pro: null, settings: { ring_radii_km: [2, 5, 10], ring_wait_seconds: [10, 10, 10], city_name: "Jamnagar", city_radius_km: 20 },
};

describe("search snapshot from get_search_state", () => {
  it("reads numbers sent as strings, drops dots without a position, keeps settings", () => {
    const s = readSearchSnapshot(raw);
    expect(s).toMatchObject({ bookingId: "b1", state: "searching", ring: 2, notified: 3, pro: null });
    expect(s?.dots).toEqual([{ key: "k1", point: { latitude: 22.48, longitude: 70.06 } }]);
    expect(s?.settings.city.name).toBe("Jamnagar");
  });
  it("found: the pro card, with a safe name", () => {
    const s = readSearchSnapshot({ ...raw, dispatch_state: "assigned", accepted_at: "2026-10-31T10:00:38Z", pro: { id: "p1", name: "  ", rating: "4.8", jobs: 31, verified: true } });
    expect(s?.pro).toEqual({ id: "p1", name: "Your pro", rating: 4.8, jobs: 31, verified: true });
    expect(s && matchSeconds(s)).toBe(38);
  });
  it("rejects anything that is not a search state", () => {
    expect(readSearchSnapshot(null)).toBeNull();
    expect(readSearchSnapshot({ dispatch_state: "searching" })).toBeNull();
  });
  it("the timer follows the server's clock, not the phone's", () => {
    const s = readSearchSnapshot(raw)!;
    const received = new Date("2026-10-31T09:00:00Z"); // phone clock 1 hour behind
    expect(searchElapsedSeconds(s, new Date(received.getTime() + 5000), received)).toBe(20);
    expect(searchElapsedSeconds({ ...s, searchedSince: null }, new Date(), new Date())).toBe(0);
  });
});

describe("drawn map scale", () => {
  it("rings at fixed fractions: 2 km, 5 km, 10 km, city", () => {
    expect(ringFractions(S).map((f) => Math.round(f * 100))).toEqual([30, 51, 71, 92]);
  });
  it("distances interpolate between the rings and never leave the map", () => {
    expect(mapFraction(S, 0)).toBe(0);
    expect(mapFraction(S, 2)).toBeCloseTo(0.3);
    expect(mapFraction(S, 1)).toBeCloseTo(0.15);
    expect(mapFraction(S, 5)).toBeCloseTo(ringFractions(S)[1]!);
    expect(mapFraction(S, 20)).toBeCloseTo(0.92);
    expect(mapFraction(S, 500)).toBe(1);
  });
  it("direction is kept: north is up, east is right", () => {
    const n = mapOffset(S, C, north(2));
    expect(n.x).toBeCloseTo(0, 3);
    expect(n.y).toBeCloseTo(-0.3, 2);
    const e = mapOffset(S, C, east(5));
    expect(e.x).toBeCloseTo(ringFractions(S)[1]!, 2);
    expect(e.y).toBeCloseTo(0, 3);
    expect(mapOffset(S, C, C)).toEqual({ x: 0, y: 0 });
  });
  it("ETA line for the found pro", () => {
    expect(distanceKm(C, north(4))).toBeCloseTo(4, 1);
    expect(etaLine(C, north(4))).toBe("10 min away");
    expect(etaLine(C, C)).toBe("1 min away");
    expect(etaLine(C, null)).toBeNull();
  });
});
