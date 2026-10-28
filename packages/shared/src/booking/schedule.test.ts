import { describe, expect, it } from "vitest";
import {
  availableTimes, bookableDates, daysFromToday, firstAvailableTime, fromClock, isBookableDate, isBookingTime, isSlotAvailable,
  snapToAvailable, toClock, toDateString, toDbTime,
} from "./schedule";

// Local-time constructors keep these tests timezone-independent.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const now = at(2026, 11, 10, 11, 30);

describe("dates", () => {
  it("formats the local date and DB time", () => {
    expect(toDateString(at(2026, 3, 5, 23, 59))).toBe("2026-03-05");
    expect(toDbTime("08:00")).toBe("08:00:00");
  });
  it("allows today (even from a midnight-based picker value) through today+7", () => {
    expect(isBookableDate(at(2026, 11, 10, 0, 0), now)).toBe(true); // the old web check wrongly disabled this
    expect(isBookableDate(at(2026, 11, 17, 18, 0), now)).toBe(true);
    expect(isBookableDate(at(2026, 11, 18), now)).toBe(false);
    expect(isBookableDate(at(2026, 11, 9, 23, 59), now)).toBe(false);
  });
  it("counts calendar days across month ends", () => {
    expect(daysFromToday(at(2026, 12, 2), at(2026, 11, 30, 22, 0))).toBe(2);
  });
  it("lists 8 pickable dates starting today", () => {
    const dates = bookableDates(now);
    expect(dates).toHaveLength(8);
    expect(toDateString(dates[0]!)).toBe("2026-11-10");
    expect(toDateString(dates[7]!)).toBe("2026-11-17");
  });
});

describe("booking times", () => {
  it("accepts 15-minute steps from 8:00 AM to 8:00 PM", () => {
    for (const t of ["08:00", "08:15", "13:45", "20:00"]) expect(isBookingTime(t)).toBe(true);
    for (const t of ["07:45", "20:15", "13:10", "8:00", "24:00", "", "ab:cd"]) expect(isBookingTime(t)).toBe(false);
  });
  it("lists 49 times on a future day", () => {
    const times = availableTimes(at(2026, 11, 11), now);
    expect(times).toHaveLength(49);
    expect([times[0], times[times.length - 1]]).toEqual(["08:00", "20:00"]);
  });
  it("starts today at least an hour from now, on the next step", () => {
    // now is 11:30 → the first time is 12:30
    expect(firstAvailableTime(at(2026, 11, 10), now)).toBe("12:30");
    expect(isSlotAvailable(at(2026, 11, 10), "12:00", now, 0)).toBe(true);
    expect(isSlotAvailable(at(2026, 11, 10), "12:00", now, 60)).toBe(false);
  });
  it("offers nothing late in the evening or outside the window", () => {
    expect(availableTimes(at(2026, 11, 10), at(2026, 11, 10, 19, 30))).toEqual([]);
    expect(firstAvailableTime(at(2026, 11, 30), now)).toBeNull();
  });
});

describe("clock", () => {
  it.each([["00:00", 12, 0, false], ["08:15", 8, 15, false], ["12:00", 12, 0, true], ["14:30", 2, 30, true], ["20:00", 8, 0, true]] as const)(
    "%s ↔ %i:%i pm=%s", (time, hour, minute, pm) => {
      expect(toClock(time)).toEqual({ hour, minute, pm });
      expect(fromClock({ hour, minute, pm })).toBe(time);
    });
  it("rejects garbage", () => expect(toClock("9am")).toBeNull());
  it("snaps to the nearest bookable time", () => {
    const opts = ["12:30", "12:45", "13:00", "14:00"];
    expect(snapToAvailable("12:45", opts)).toBe("12:45");
    expect(snapToAvailable("12:00", opts)).toBe("12:30"); // same hour
    expect(snapToAvailable("09:00", opts)).toBe("12:30"); // next free time
    expect(snapToAvailable("22:00", opts)).toBe("14:00"); // after the last: the last one
    expect(snapToAvailable("10:00", [])).toBeNull();
  });
});
