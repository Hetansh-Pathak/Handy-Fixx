import { describe, expect, it } from "vitest";
import { countByStage, defaultJobStage, JOB_STAGES, jobStage } from "./job-stages";

const now = new Date(2026, 10, 10, 11, 30);
const later = { booking_date: "2026-11-11", booking_time: "10:00:00" };
const past = { booking_date: "2026-11-09", booking_time: "10:00:00" };

describe("jobStage", () => {
  it.each([
    ["pending", later, "new"],
    ["pending", past, "cancelled"],
    ["confirmed", later, "accepted"],
    ["on_the_way", later, "on_the_way"],
    ["arrived", later, "on_the_way"],
    ["in_progress", later, "started"],
    ["completed", past, "completed"],
    ["cancelled", later, "cancelled"],
    ["something_new", later, "cancelled"],
  ] as const)("%s → %s", (status, when, stage) => expect(jobStage({ status, ...when }, now)).toBe(stage));
});

describe("countByStage and defaultJobStage", () => {
  const rows = [
    { status: "pending", ...later },
    { status: "in_progress", ...later },
    { status: "confirmed", ...later },
    { status: "confirmed", ...later },
    { status: "completed", ...past },
  ];
  it("counts every tab", () => {
    expect(countByStage(rows, now)).toEqual({ new: 1, accepted: 2, on_the_way: 0, started: 1, completed: 1, cancelled: 0 });
  });
  it("opens new requests first, then the job in hand", () => {
    expect(defaultJobStage(countByStage(rows, now))).toBe("new");
    expect(defaultJobStage(countByStage(rows.slice(1), now))).toBe("started");
    expect(defaultJobStage(countByStage([], now))).toBe("new");
  });
  it("has a tab for every stage, in job order", () => {
    expect(JOB_STAGES.map((s) => s.key)).toEqual(["new", "accepted", "on_the_way", "started", "completed", "cancelled"]);
  });
});
