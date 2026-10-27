import { describe, expect, it } from "vitest";
import { groupBookings, isActiveBookingStatus, showsCompletionCode, showsLiveMap } from "./grouping";

const row = (id: string, status: string, created_at: string | null) => ({ id, status, created_at });

describe("groupBookings", () => {
  it("splits unfinished from finished and sorts newest first", () => {
    const g = groupBookings([
      row("old-done", "completed", "2026-11-01T10:00:00Z"),
      row("active-1", "confirmed", "2026-11-09T10:00:00Z"),
      row("new-cancel", "cancelled", "2026-11-08T10:00:00Z"),
      row("active-2", "pending", "2026-11-10T10:00:00Z"),
      row("no-date", "in_progress", null),
    ]);
    expect(g.active.map((r) => r.id)).toEqual(["active-2", "active-1", "no-date"]);
    expect(g.past.map((r) => r.id)).toEqual(["new-cancel", "old-done"]);
  });
  it("copes with an empty list and does not mutate its input", () => {
    expect(groupBookings([])).toEqual({ active: [], past: [] });
    const input = [row("a", "completed", "2026-01-01T00:00:00Z"), row("b", "pending", "2026-02-01T00:00:00Z")];
    groupBookings(input);
    expect(input.map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("knows which statuses are unfinished", () => {
    for (const s of ["pending", "confirmed", "on_the_way", "arrived", "in_progress"]) expect(isActiveBookingStatus(s)).toBe(true);
    for (const s of ["completed", "cancelled", "weird"]) expect(isActiveBookingStatus(s)).toBe(false);
  });
});

describe("what the status screen shows", () => {
  it("shows the code once the pro arrives or starts, never earlier or after", () => {
    expect(["pending", "confirmed", "on_the_way", "arrived", "in_progress", "completed", "cancelled"].filter(showsCompletionCode)).toEqual(["arrived", "in_progress"]);
  });
  it("shows the live map while the pro travels or is on site", () => {
    expect(["pending", "confirmed", "on_the_way", "arrived", "in_progress", "completed"].filter(showsLiveMap)).toEqual(["on_the_way", "arrived"]);
  });
});
