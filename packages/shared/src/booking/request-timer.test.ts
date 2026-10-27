import { describe, expect, it } from "vitest";
import { isRequestExpired, requestProgress, secondsRemaining } from "./request-timer";

const sent = new Date("2026-11-10T10:00:00.000Z");
const plus = (s: number) => new Date(sent.getTime() + s * 1000);

describe("request timer (30 s)", () => {
  it("counts down", () => {
    expect(secondsRemaining(sent, plus(0))).toBe(30);
    expect(secondsRemaining(sent, plus(7))).toBe(23);
    expect(secondsRemaining(sent, plus(7.2))).toBe(23);
    expect(secondsRemaining(sent, plus(29.5))).toBe(1);
  });
  it("expires at 30 s and never goes negative", () => {
    expect(secondsRemaining(sent, plus(30))).toBe(0);
    expect(secondsRemaining(sent, plus(300))).toBe(0);
    expect(isRequestExpired(sent, plus(29))).toBe(false);
    expect(isRequestExpired(sent, plus(30))).toBe(true);
  });
  it("tolerates a device clock slightly behind the server", () => {
    expect(secondsRemaining(sent, plus(-5))).toBe(30);
  });
  it("gives ring progress", () => {
    expect(requestProgress(sent, plus(0))).toBe(1);
    expect(requestProgress(sent, plus(15))).toBe(0.5);
    expect(requestProgress(sent, plus(40))).toBe(0);
  });
});
