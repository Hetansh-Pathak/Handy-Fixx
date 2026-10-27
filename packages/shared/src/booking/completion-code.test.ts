import { describe, expect, it } from "vitest";
import { formatLockTime, interpretCompletion, isCompletionCode } from "./completion-code";

const now = new Date("2026-11-10T10:00:00Z");
const inMin = (m: number) => new Date(now.getTime() + m * 60_000).toISOString();

describe("completion code", () => {
  it("is exactly 4 digits", () => {
    expect(isCompletionCode("0123")).toBe(true);
    expect(isCompletionCode("123")).toBe(false);
    expect(isCompletionCode("12345")).toBe(false);
    expect(isCompletionCode("12a4")).toBe(false);
  });
  it("formats lock times", () => {
    expect(formatLockTime(inMin(0.5), now)).toBe("less than a minute");
    expect(formatLockTime(inMin(14.2), now)).toBe("15 minutes");
    expect(formatLockTime(inMin(-5), now)).toBe("less than a minute");
  });
});

describe("interpretCompletion", () => {
  it("success", () => {
    expect(interpretCompletion({ ok: true })).toEqual({ kind: "completed" });
  });
  it("wrong code with attempts left", () => {
    expect(interpretCompletion({ ok: false, reason: "wrong_code", attempts_left: 3 }, now)).toMatchObject({
      kind: "error", clearCode: true, attemptsLeft: 3, message: "Incorrect code. 3 attempts left.",
    });
    expect(interpretCompletion({ ok: false, reason: "wrong_code", attempts_left: 1 }, now))
      .toMatchObject({ message: "Incorrect code. 1 attempt left." });
    expect(interpretCompletion({ ok: false, reason: "wrong_code", attempts_left: 0 }, now))
      .toMatchObject({ message: "Incorrect code. No attempts left." });
  });
  it("wrong code that triggers the lock-out", () => {
    const r = interpretCompletion({ ok: false, reason: "wrong_code", attempts_left: 0, locked: true, locked_until: inMin(15) }, now);
    expect(r).toMatchObject({ kind: "error", attemptsLeft: 0, lockedUntil: inMin(15) });
    expect(r.kind === "error" && r.message).toBe("Too many wrong attempts. Try again in 15 minutes.");
  });
  it("already locked", () => {
    expect(interpretCompletion({ ok: false, reason: "locked", locked_until: inMin(9) }, now))
      .toMatchObject({ message: "Locked. Try again in 9 minutes.", clearCode: false });
    expect(interpretCompletion({ ok: false, reason: "locked" }, now))
      .toMatchObject({ message: "Locked. Try again in a few minutes." });
  });
  it("other failures", () => {
    expect(interpretCompletion({ ok: false, reason: "invalid_status" }, now))
      .toMatchObject({ message: expect.stringContaining("not in progress") });
    expect(interpretCompletion({ ok: false, reason: "unauthorized" }, now))
      .toMatchObject({ message: expect.stringContaining("not allowed") });
    expect(interpretCompletion({ ok: false, reason: "no_code" }, now))
      .toMatchObject({ message: "An error occurred. Please try again." });
  });
});
