import { describe, expect, it } from "vitest";
import { BUSY_MESSAGE, DEFAULT_JOB_MINUTES, providerBusy, slotStartMs, TRAVEL_BUFFER_MINUTES, type JobSlot } from "./provider-busy";

const job = (over: Partial<JobSlot> & { id: string }): JobSlot => ({ status: "confirmed", date: "2026-11-05", time: "10:00", durationMinutes: 60, ...over });
const request = job({ id: "req", status: "pending", time: "14:00" });

describe("providerBusy", () => {
  it("is free with no jobs", () => {
    expect(providerBusy({ jobs: [], request })).toEqual({ busy: false });
  });

  it.each(["on_the_way", "arrived", "in_progress"])("is busy while a job is %s, at any time of day", (status) => {
    const r = providerBusy({ jobs: [job({ id: "j1", status, date: "2026-11-01", time: "08:00" })], request });
    expect(r).toMatchObject({ busy: true, reason: "in_progress", jobId: "j1", message: BUSY_MESSAGE });
  });

  it("is busy for a confirmed job that overlaps the request", () => {
    const r = providerBusy({ jobs: [job({ id: "j2", time: "13:30" })], request });
    expect(r).toMatchObject({ busy: true, reason: "overlap", jobId: "j2" });
  });

  it("is busy when the request starts inside the confirmed job", () => {
    expect(providerBusy({ jobs: [job({ id: "j", time: "13:00", durationMinutes: 120 })], request }).busy).toBe(true);
  });

  it("is free for a confirmed job at a different time of day", () => {
    expect(providerBusy({ jobs: [job({ id: "j3", time: "09:00" })], request })).toEqual({ busy: false });
  });

  it("is free for a confirmed job on another day", () => {
    expect(providerBusy({ jobs: [job({ id: "j4", date: "2026-11-06", time: "14:00" })], request })).toEqual({ busy: false });
  });

  it("ignores cancelled, completed and pending jobs", () => {
    const jobs = ["cancelled", "completed", "pending"].map((status, i) => job({ id: `x${i}`, status, time: "14:00" }));
    expect(providerBusy({ jobs, request })).toEqual({ busy: false });
  });

  it("does not count the request against itself", () => {
    expect(providerBusy({ jobs: [job({ id: "req", status: "confirmed", time: "14:00" })], request })).toEqual({ busy: false });
  });

  describe("boundaries (60 min job, 30 min buffer)", () => {
    // A job at 12:30 ends 13:30; the buffer keeps the pro free until 14:00, so a 14:00 request is allowed.
    it("allows a request exactly one buffer after the job ends", () => {
      expect(providerBusy({ jobs: [job({ id: "a", time: "12:30" })], request }).busy).toBe(false);
    });
    it("blocks a request one minute inside the buffer", () => {
      expect(providerBusy({ jobs: [job({ id: "a", time: "12:31" })], request }).busy).toBe(true);
    });
    // The request runs 14:00 to 15:00; a job at 15:30 starts exactly one buffer later.
    it("allows a job starting exactly one buffer after the request ends", () => {
      expect(providerBusy({ jobs: [job({ id: "b", time: "15:30" })], request }).busy).toBe(false);
    });
    it("blocks a job starting one minute inside that buffer", () => {
      expect(providerBusy({ jobs: [job({ id: "b", time: "15:29" })], request }).busy).toBe(true);
    });
  });

  it("uses the default duration when it is missing, empty or not positive", () => {
    expect(DEFAULT_JOB_MINUTES).toBe(60);
    for (const durationMinutes of [undefined, null, 0, -5, Number.NaN]) {
      expect(providerBusy({ jobs: [job({ id: "j", time: "12:30", durationMinutes })], request }).busy).toBe(false);
      expect(providerBusy({ jobs: [job({ id: "j", time: "12:31", durationMinutes })], request }).busy).toBe(true);
    }
  });

  it("uses the request's own duration", () => {
    const long = { ...request, time: "10:00", durationMinutes: 180 };
    expect(providerBusy({ jobs: [job({ id: "j", time: "12:59" })], request: long }).busy).toBe(true);
    expect(providerBusy({ jobs: [job({ id: "j", time: "12:59" })], request: { ...long, durationMinutes: 60 } }).busy).toBe(false);
  });

  it("ignores a confirmed job or a request without a readable time", () => {
    expect(providerBusy({ jobs: [job({ id: "j", time: null })], request })).toEqual({ busy: false });
    expect(providerBusy({ jobs: [job({ id: "j", time: "14:00" })], request: { ...request, time: null } })).toEqual({ busy: false });
    // ...but an active job still blocks even when the request has no time.
    expect(providerBusy({ jobs: [job({ id: "j", status: "in_progress" })], request: { ...request, time: null } }).busy).toBe(true);
  });

  it("accepts HH:MM:SS times from the database", () => {
    expect(providerBusy({ jobs: [job({ id: "j", time: "13:30:00" })], request: { ...request, time: "14:00:00" } }).busy).toBe(true);
  });

  it("names the buffer as a constant", () => {
    expect(TRAVEL_BUFFER_MINUTES).toBe(30);
  });
});

describe("slotStartMs", () => {
  it("reads day and time", () => {
    expect(slotStartMs("2026-11-05", "09:15:00")).toBe(new Date(2026, 10, 5, 9, 15).getTime());
  });
  it("rejects missing or impossible values", () => {
    expect(slotStartMs(null, "09:00")).toBeNull();
    expect(slotStartMs("2026-11-05", undefined)).toBeNull();
    expect(slotStartMs("2026-11-05", "25:00")).toBeNull();
    expect(slotStartMs("soon", "09:00")).toBeNull();
  });
});
