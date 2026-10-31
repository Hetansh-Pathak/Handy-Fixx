import { describe, expect, it } from "vitest";
import { CLOSING_PROBLEM_AFTER_MS, closingProblem, closingProblemCutoff, closingPrompt } from "./closing-problem";

const start = new Date("2026-11-02T10:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);

describe("closingProblem", () => {
  it("is not active before 2 hours", () => {
    expect(closingProblem({ status: "in_progress", startedAt: start, now: at(CLOSING_PROBLEM_AFTER_MS - 1) })).toEqual({ active: false });
    expect(closingProblem({ status: "in_progress", startedAt: start, now: start })).toEqual({ active: false });
  });
  it("becomes active at exactly 2 hours and counts the minutes over", () => {
    expect(closingProblem({ status: "in_progress", startedAt: start, now: at(CLOSING_PROBLEM_AFTER_MS) })).toEqual({ active: true, minutesOver: 0, hoursSinceStart: 2 });
    expect(closingProblem({ status: "in_progress", startedAt: start.toISOString(), now: at(CLOSING_PROBLEM_AFTER_MS + 90 * 60_000) }))
      .toEqual({ active: true, minutesOver: 90, hoursSinceStart: 3 });
  });
  it("only applies while the job is in progress", () => {
    for (const status of ["pending", "confirmed", "on_the_way", "arrived", "completed", "cancelled"]) {
      expect(closingProblem({ status, startedAt: start, now: at(5 * 3_600_000) })).toEqual({ active: false });
    }
  });
  it("is never active for a missing, invalid or future start", () => {
    const now = at(5 * 3_600_000);
    for (const startedAt of [null, undefined, "", "garbage"]) expect(closingProblem({ status: "in_progress", startedAt, now })).toEqual({ active: false });
    expect(closingProblem({ status: "in_progress", startedAt: at(10 * 3_600_000), now })).toEqual({ active: false });
    expect(closingProblem({ status: "in_progress", startedAt: start, now: new Date("invalid") })).toEqual({ active: false });
  });
});

describe("closingPrompt", () => {
  it("tells the customer to share the code only when happy, and to contact apnabanda otherwise", () => {
    const p = closingPrompt("customer", "Rajesh");
    expect(p.title).toBe("Problem closing the job?");
    expect(p.body).toContain("Rajesh");
    expect(p.body).toContain("contact apnabanda");
    expect(p.body).toContain("Never share the code before the work is done");
  });
  it("tells the pro to ask for the code only after the work, and to contact apnabanda otherwise", () => {
    const p = closingPrompt("provider", "Meera");
    expect(p.body).toContain("Meera");
    expect(p.body).toContain("contact apnabanda");
    expect(p.body).toContain("Do not ask for the code before the work is finished");
  });
  it("falls back to plain words without a name", () => {
    expect(closingPrompt("customer").body).toContain("your pro");
    expect(closingPrompt("provider", "  ").body).toContain("the customer");
  });
});

describe("closingProblemCutoff", () => {
  it("is exactly 2 hours before now", () => {
    expect(closingProblemCutoff(new Date("2026-11-02T12:00:00Z"))).toBe("2026-11-02T10:00:00.000Z");
  });
});
