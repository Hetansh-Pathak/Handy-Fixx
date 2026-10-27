import { describe, expect, it } from "vitest";
import {
  bookableDates, BOOKING_SLOTS, daysFromToday, isBookableDate, isSlotAvailable, slotsForDate, toDateString, toDbTime,
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

describe("slots", () => {
  it("hides past slots today but offers later ones", () => {
    const today = at(2026, 11, 10);
    const avail = Object.fromEntries(slotsForDate(today, now).map((s) => [s.slot, s.available]));
    expect(avail).toEqual({ "08:00": false, "10:00": false, "12:00": true, "14:00": true, "16:00": true, "18:00": true });
  });
  it("offers every slot on a future day", () => {
    expect(slotsForDate(at(2026, 11, 11), now).every((s) => s.available)).toBe(true);
    expect(slotsForDate(at(2026, 11, 11), now)).toHaveLength(BOOKING_SLOTS.length);
  });
  it("respects a lead time", () => {
    const today = at(2026, 11, 10);
    expect(isSlotAvailable(today, "12:00", now, 0)).toBe(true);
    expect(isSlotAvailable(today, "12:00", now, 60)).toBe(false); // only 30 min away
  });
  it("offers nothing outside the booking window", () => {
    expect(slotsForDate(at(2026, 11, 30), now).some((s) => s.available)).toBe(false);
  });
});

import { formatBookingWhen, formatDateChip, formatSlot, parseDateString } from "./schedule";

describe("display formatting", () => {
  it("formats date chips", () => {
    expect(formatDateChip(new Date(2026, 10, 10))).toBe("Tue, 10 Nov");
    expect(formatDateChip(new Date(2026, 0, 1))).toBe("Thu, 1 Jan");
  });
  it.each([["08:00", "8:00 AM"], ["12:00", "12:00 PM"], ["00:30", "12:30 AM"], ["14:00:00", "2:00 PM"], ["18:00", "6:00 PM"], ["x", "x"], ["25:00", "25:00"]])(
    "formatSlot %s -> %s", (input, out) => expect(formatSlot(input)).toBe(out));
  it("parses a local date string and rejects impossible dates", () => {
    const d = parseDateString("2026-11-10")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 10]);
    for (const bad of ["2026-02-30", "2026-13-01", "10/11/2026", ""]) expect(parseDateString(bad)).toBeNull();
  });
  it("formats a stored booking date and time", () => {
    expect(formatBookingWhen("2026-11-10", "14:00:00")).toBe("Tue, 10 Nov · 2:00 PM");
    expect(formatBookingWhen("2026-11-10", null)).toBe("Tue, 10 Nov");
    expect(formatBookingWhen(null, "08:00")).toBe("8:00 AM");
    expect(formatBookingWhen(undefined, undefined)).toBe("");
  });
});
