import { describe, expect, it } from "vitest";
import { ARRIVAL_NEAR_KM, describeArrival, mapsLink } from "./arrival-evidence";

const at = "2026-11-02T10:30:00Z";
const job = { jobLat: 23.2156, jobLng: 72.6369 };

describe("describeArrival", () => {
  it("says nothing was recorded without an arrival time", () => {
    for (const v of [undefined, null, "", "garbage"]) expect(describeArrival({ at: v, ...job }).state).toBe("not_recorded");
  });
  it("keeps the time when the position is missing or the job has no coordinates", () => {
    expect(describeArrival({ at, lat: null, lng: null, ...job })).toMatchObject({ state: "time_only", at });
    expect(describeArrival({ at, lat: 23.2, lng: 72.6 })).toMatchObject({ state: "time_only", at });
  });
  it("is near when the pro was at the address", () => {
    const a = describeArrival({ at, lat: 23.2157, lng: 72.637, ...job });
    expect(a.state).toBe("near");
    expect(a.line).toMatch(/^Arrived about \d+ m from the job address\.$/);
  });
  it("is far, with a hint to check with both sides, when the pro was elsewhere", () => {
    const a = describeArrival({ at, lat: 23.25, lng: 72.68, ...job });
    expect(a.state).toBe("far");
    expect(a.line).toContain("km from the job address");
    expect(a.line).toContain("Check this with both sides");
  });
  it("reads Postgres numerics that arrive as strings", () => {
    expect(describeArrival({ at, lat: "23.2157", lng: "72.637", jobLat: "23.2156", jobLng: "72.6369" }).state).toBe("near");
  });
  it("treats an impossible position as missing", () => {
    expect(describeArrival({ at, lat: 999, lng: 72, ...job }).state).toBe("time_only");
  });
  it("the near limit is 300 m", () => {
    expect(ARRIVAL_NEAR_KM).toBe(0.3);
  });
});

describe("mapsLink", () => {
  it("builds a link for a real point only", () => {
    expect(mapsLink(23.2, 72.6)).toBe("https://www.google.com/maps?q=23.2,72.6");
    expect(mapsLink(null, 72.6)).toBeNull();
    expect(mapsLink(200, 72.6)).toBeNull();
  });
});
