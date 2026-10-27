import { describe, expect, it } from "vitest";
import { addMonths, launchStatus } from "./launch";

const start = new Date("2026-11-01T00:00:00Z");

describe("addMonths", () => {
  it("adds calendar months", () => {
    expect(addMonths(start, 3).toISOString()).toBe("2027-02-01T00:00:00.000Z");
  });
  it("clamps to the end of shorter months", () => {
    expect(addMonths(new Date("2027-01-31T00:00:00Z"), 1).toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(addMonths(new Date("2028-01-31T00:00:00Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
  it("rolls over the year", () => {
    expect(addMonths(new Date("2026-11-15T00:00:00Z"), 3).toISOString()).toBe("2027-02-15T00:00:00.000Z");
  });
});

describe("launchStatus", () => {
  it("is active in the first 3 months and the first 10 jobs", () => {
    const s = launchStatus({ launchStartedAt: start, completedJobs: 4, now: new Date("2026-12-15T00:00:00Z") });
    expect(s).toMatchObject({ active: true, jobsLeft: 6 });
    if (s.active) expect(s.daysLeft).toBe(48);
  });
  it("ends after 3 months", () => {
    expect(launchStatus({ launchStartedAt: start, completedJobs: 1, now: new Date("2027-02-01T00:00:00Z") }))
      .toEqual({ active: false, reason: "time_over" });
  });
  it("ends after 10 completed jobs, whichever comes first", () => {
    expect(launchStatus({ launchStartedAt: start, completedJobs: 10, now: new Date("2026-11-02T00:00:00Z") }))
      .toEqual({ active: false, reason: "jobs_over" });
    // the 10th job itself (9 completed before it) is still free
    expect(launchStatus({ launchStartedAt: start, completedJobs: 9, now: new Date("2026-11-02T00:00:00Z") }).active).toBe(true);
  });
  it("does not start until the provider is approved", () => {
    expect(launchStatus({ launchStartedAt: null, completedJobs: 0, now: start }))
      .toEqual({ active: false, reason: "not_started" });
  });
});
