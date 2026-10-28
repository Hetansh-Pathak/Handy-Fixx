import { describe, expect, it } from "vitest";
import {
  DAY_NAMES, MIN_WINDOW_MINUTES, copyDayTo, describeDay, normalizeClock, restrictToWindows, validateWindow, windowsOn, type AvailabilityRow,
} from "./weekly-schedule";

const row = (day: string, start: string, end: string, on = true): AvailabilityRow => ({ day_of_week: day, start_time: start, end_time: end, is_available: on });
// 2026-11-02 is a Monday.
const monday = new Date(2026, 10, 2);
const tuesday = new Date(2026, 10, 3);

describe("DAY_NAMES", () => {
  it("is indexed like Date.getDay()", () => {
    expect(DAY_NAMES[monday.getDay()]).toBe("monday");
    expect(DAY_NAMES[0]).toBe("sunday");
  });
});

describe("normalizeClock", () => {
  it("accepts HH:MM and the database's HH:MM:SS", () => {
    expect(normalizeClock("09:00:00")).toBe("09:00");
    expect(normalizeClock("9:05")).toBe("09:05");
    expect(normalizeClock("17:30")).toBe("17:30");
  });
  it("rejects anything else", () => {
    for (const bad of ["", "25:00", "09:60", "nine", "9", "09-00"]) expect(normalizeClock(bad)).toBeNull();
  });
});

describe("validateWindow", () => {
  it("accepts a normal window", () => expect(validateWindow("09:00", "17:00", [])).toBeNull());
  it("needs a start before the end", () => {
    expect(validateWindow("17:00", "09:00", [])).toMatch(/before/i);
    expect(validateWindow("09:00", "09:00", [])).toMatch(/before/i);
  });
  it("needs at least an hour", () => {
    expect(MIN_WINDOW_MINUTES).toBe(60);
    expect(validateWindow("09:00", "09:30", [])).toMatch(/1 hour/);
  });
  it("rejects bad times", () => expect(validateWindow("9am", "5pm", [])).toMatch(/time/i));
  it("rejects a window that overlaps another on the same day", () => {
    const others = [{ start: "09:00", end: "13:00" }];
    expect(validateWindow("12:00", "16:00", others)).toMatch(/overlap/i);
    expect(validateWindow("13:00", "17:00", others)).toBeNull();
  });
});

describe("windowsOn", () => {
  it("is null (no limit) for a pro who never set a schedule", () => {
    expect(windowsOn([], monday)).toBeNull();
  });
  it("lists the available windows for that weekday, earliest first", () => {
    const rows = [row("monday", "14:00:00", "18:00:00"), row("monday", "09:00:00", "12:00:00"), row("tuesday", "09:00:00", "12:00:00")];
    expect(windowsOn(rows, monday)).toEqual([{ start: 540, end: 720 }, { start: 840, end: 1080 }]);
  });
  it("is empty (day off) when the pro has a schedule but nothing on that day", () => {
    expect(windowsOn([row("monday", "09:00", "12:00")], tuesday)).toEqual([]);
  });
  it("ignores slots switched off", () => {
    expect(windowsOn([row("monday", "09:00", "12:00", false)], monday)).toEqual([]);
  });
  it("ignores malformed rows", () => {
    expect(windowsOn([row("monday", "bad", "12:00"), row("monday", "12:00", "09:00")], monday)).toEqual([]);
  });
});

describe("restrictToWindows", () => {
  const slots = ["08:00", "09:00", "11:45", "12:00", "14:00", "17:45", "18:00"];
  it("keeps everything when there is no limit", () => expect(restrictToWindows(slots, null)).toEqual(slots));
  it("keeps starts inside a window, and drops a start with less than an hour left", () => {
    expect(restrictToWindows(slots, [{ start: 540, end: 720 }, { start: 840, end: 1080 }])).toEqual(["09:00", "14:00"]);
  });
  it("a day off leaves nothing", () => expect(restrictToWindows(slots, [])).toEqual([]));
});

describe("describeDay", () => {
  it("writes hours for a customer", () => {
    expect(describeDay([{ start: 540, end: 1080 }])).toBe("9:00 AM – 6:00 PM");
    expect(describeDay([{ start: 540, end: 720 }, { start: 840, end: 1080 }])).toBe("9:00 AM – 12:00 PM, 2:00 PM – 6:00 PM");
    expect(describeDay([])).toBe("Day off");
  });
});

describe("copyDayTo", () => {
  it("copies the windows to the other days as new rows", () => {
    const source = [row("monday", "09:00:00", "12:00:00"), row("monday", "14:00:00", "18:00:00", false)];
    const copied = copyDayTo(source, "monday", ["tuesday", "wednesday"]);
    expect(copied).toEqual([
      { day_of_week: "tuesday", start_time: "09:00", end_time: "12:00", is_available: true },
      { day_of_week: "wednesday", start_time: "09:00", end_time: "12:00", is_available: true },
    ]);
  });
  it("never copies a day onto itself", () => {
    expect(copyDayTo([row("monday", "09:00", "12:00")], "monday", ["monday", "tuesday"]).map((r) => r.day_of_week)).toEqual(["tuesday"]);
  });
});
