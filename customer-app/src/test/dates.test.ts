import { describe, it, expect } from "vitest";
import { dayGroup, formatClock, formatSchedule, parseLocalDate, timeAgo } from "@/lib/dates";

// Monday 5 Oct 2026, noon (local)
const NOW = new Date(2026, 9, 5, 12, 0, 0);

describe("parseLocalDate", () => {
  it("reads yyyy-MM-dd as a local date, not UTC", () => {
    const d = parseLocalDate("2026-10-05");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 5]);
  });
  it("returns null for empty or garbage", () => {
    expect(parseLocalDate(null)).toBe(null);
    expect(parseLocalDate("nope")).toBe(null);
  });
});

describe("formatClock", () => {
  it("formats 12-hour times", () => {
    expect(formatClock("16:30:00")).toBe("4:30 PM");
    expect(formatClock("00:05")).toBe("12:05 AM");
    expect(formatClock("12:00:00")).toBe("12:00 PM");
    expect(formatClock("09:15:00")).toBe("9:15 AM");
  });
  it("rejects bad input", () => {
    expect(formatClock("25:00")).toBe(null);
    expect(formatClock("soon")).toBe(null);
    expect(formatClock(null)).toBe(null);
  });
});

describe("formatSchedule", () => {
  it("uses Today / Tomorrow / Yesterday", () => {
    expect(formatSchedule("2026-10-05", "16:30:00", NOW)).toBe("Today, 4:30 PM");
    expect(formatSchedule("2026-10-06", "09:00:00", NOW)).toBe("Tomorrow, 9:00 AM");
    expect(formatSchedule("2026-10-04", null, NOW)).toBe("Yesterday");
  });
  it("uses weekday and date otherwise, with the year only when it differs", () => {
    expect(formatSchedule("2026-10-08", "10:00", NOW)).toBe("Thu, 8 Oct, 10:00 AM");
    expect(formatSchedule("2027-01-03", null, NOW)).toBe("3 Jan 2027");
  });
  it("handles a missing date", () => {
    expect(formatSchedule(null, "10:00", NOW)).toBe("Date not set");
  });
});

describe("timeAgo", () => {
  it("steps through seconds, minutes, hours and days", () => {
    const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
    expect(timeAgo(ago(20_000), NOW)).toBe("Just now");
    expect(timeAgo(ago(5 * 60_000), NOW)).toBe("5m ago");
    expect(timeAgo(ago(3 * 3_600_000), NOW)).toBe("3h ago");
    expect(timeAgo(ago(2 * 86_400_000), NOW)).toBe("2d ago");
  });
  it("shows a date after a week", () => {
    expect(timeAgo(new Date(2026, 8, 20, 10).toISOString(), NOW)).toBe("20 Sep");
  });
});

describe("dayGroup", () => {
  it("groups by calendar day, not by 24-hour windows", () => {
    expect(dayGroup(new Date(2026, 9, 5, 0, 5).toISOString(), NOW)).toBe("Today");
    expect(dayGroup(new Date(2026, 9, 4, 23, 55).toISOString(), NOW)).toBe("Yesterday");
    expect(dayGroup(new Date(2026, 9, 1, 9).toISOString(), NOW)).toBe("Earlier");
  });
});
