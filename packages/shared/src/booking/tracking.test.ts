import { describe, expect, it } from "vitest";
import { LOCATION_STALE_SECONDS, trackingSummary } from "./tracking";

const now = new Date("2026-11-10T10:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
const home = { latitude: 23.2156, longitude: 72.6369 };
const near = { latitude: 23.2256, longitude: 72.6369 }; // about 1.1 km north

describe("trackingSummary", () => {
  it("shows the pro's own ETA and the distance", () => {
    const s = trackingSummary({ pro: near, destination: home, etaMinutes: 12, updatedAt: ago(5), now });
    expect(s).toMatchObject({ hasLocation: true, etaText: "12 min", stale: false, ageSeconds: 5 });
    expect(s.distanceText).toMatch(/^1\.[01] km away$/);
  });
  it("estimates the ETA from distance when the pro has not sent one", () => {
    const s = trackingSummary({ pro: near, destination: home, etaMinutes: null, updatedAt: ago(5), now });
    expect(s.etaText).toBe("3 min");
  });
  it("ignores a zero or invalid pro ETA", () => {
    for (const eta of [0, -3, Number.NaN]) {
      expect(trackingSummary({ pro: near, destination: home, etaMinutes: eta, updatedAt: ago(1), now }).etaText).toBe("3 min");
    }
  });
  it("marks an old position as stale", () => {
    expect(trackingSummary({ pro: near, destination: home, etaMinutes: 5, updatedAt: ago(LOCATION_STALE_SECONDS), now }).stale).toBe(false);
    expect(trackingSummary({ pro: near, destination: home, etaMinutes: 5, updatedAt: ago(LOCATION_STALE_SECONDS + 1), now }).stale).toBe(true);
    expect(trackingSummary({ pro: near, destination: home, etaMinutes: 5, updatedAt: null, now })).toMatchObject({ stale: true, ageSeconds: null });
  });
  it("has nothing to show before the pro shares a position", () => {
    expect(trackingSummary({ pro: null, destination: home, etaMinutes: null, updatedAt: null, now }))
      .toEqual({ hasLocation: false, distanceText: "", etaText: "", stale: false, ageSeconds: null });
  });
  it("still shows the pro's ETA when the customer's pin is missing", () => {
    expect(trackingSummary({ pro: near, destination: null, etaMinutes: 9, updatedAt: ago(2), now })).toMatchObject({ distanceText: "", etaText: "9 min" });
  });
  it("never reports a negative age for a device clock behind the server", () => {
    expect(trackingSummary({ pro: near, destination: home, etaMinutes: 5, updatedAt: ago(-30), now }).ageSeconds).toBe(0);
  });
});
