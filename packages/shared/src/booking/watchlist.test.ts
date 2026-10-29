import { describe, expect, it } from "vitest";
import {
  ABANDONED_AFTER_HOURS, DECLINE_REASON, PENDING_WATCH_MINUTES, flaggedProviders, isPendingTooLong, minutesWaiting, pendingWatchCutoff,
  providerFlags, summariseProviderActivity, type ActivityRow,
} from "./watchlist";

const now = new Date("2026-11-05T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

describe("pending requests waiting too long", () => {
  it("is true from exactly 15 minutes, only while pending", () => {
    expect(PENDING_WATCH_MINUTES).toBe(15);
    expect(isPendingTooLong({ status: "pending", createdAt: ago(14), now })).toBe(false);
    expect(isPendingTooLong({ status: "pending", createdAt: ago(15), now })).toBe(true);
    expect(isPendingTooLong({ status: "pending", createdAt: ago(300), now })).toBe(true);
    for (const status of ["confirmed", "completed", "cancelled", "in_progress"]) expect(isPendingTooLong({ status, createdAt: ago(300), now })).toBe(false);
  });
  it("ignores unreadable times and never goes negative", () => {
    expect(isPendingTooLong({ status: "pending", createdAt: null, now })).toBe(false);
    expect(isPendingTooLong({ status: "pending", createdAt: "garbage", now })).toBe(false);
    expect(minutesWaiting(ago(-10), now)).toBe(0);
    expect(minutesWaiting(ago(90), now)).toBe(90);
  });
  it("gives the cutoff 15 minutes back", () => {
    expect(pendingWatchCutoff(now)).toBe("2026-11-05T11:45:00.000Z");
  });
});

const rows = (pro: string, spec: Partial<Record<string, number>>, extra: Partial<ActivityRow> = {}): ActivityRow[] => {
  const out: ActivityRow[] = [];
  const add = (n: number | undefined, row: Omit<ActivityRow, "provider_id">) => { for (let i = 0; i < (n ?? 0); i += 1) out.push({ provider_id: pro, ...row, ...extra }); };
  add(spec.completed, { status: "completed" });
  add(spec.declined, { status: "cancelled", cancellation_reason: DECLINE_REASON });
  add(spec.stale, { status: "confirmed", updated_at: ago(ABANDONED_AFTER_HOURS * 60 + 5) });
  add(spec.fresh, { status: "in_progress", updated_at: ago(30) });
  add(spec.noshow, { status: "cancelled", cancellation_reason: "Provider unavailable" });
  add(spec.customer, { status: "cancelled", cancellation_reason: "Cancelled by customer" });
  return out;
};

describe("summariseProviderActivity", () => {
  it("counts completed, declined, active and abandoned per pro", () => {
    const [a] = summariseProviderActivity(rows("p1", { completed: 3, declined: 2, stale: 1, fresh: 1, noshow: 1, customer: 4 }), now);
    expect(a).toMatchObject({ providerId: "p1", requests: 12, completed: 3, declined: 2, active: 1, abandoned: 2, accepted: 6 });
    expect(a!.acceptanceRate).toBeCloseTo(6 / 8);
    expect(a!.completionRate).toBeCloseTo(3 / 5);
  });
  it("does not count a customer's own cancellation against the pro", () => {
    const [a] = summariseProviderActivity(rows("p1", { customer: 6 }), now);
    expect(a).toMatchObject({ declined: 0, abandoned: 0, accepted: 0, acceptanceRate: null, completionRate: null });
  });
  it("ignores rows without a pro and keeps pros apart", () => {
    const list = summariseProviderActivity([...rows("a", { completed: 1 }), ...rows("b", { declined: 2 }), { provider_id: null, status: "completed" }], now);
    expect(list.map((x) => x.providerId).sort()).toEqual(["a", "b"]);
  });
  it("a missing update time is treated as recent, not abandoned", () => {
    const [a] = summariseProviderActivity([{ provider_id: "p", status: "confirmed" }], now);
    expect(a).toMatchObject({ active: 1, abandoned: 0 });
  });
});

describe("providerFlags", () => {
  const act = (spec: Partial<Record<string, number>>) => summariseProviderActivity(rows("p", spec), now)[0]!;
  it("flags high acceptance with low completion (needs 5 accepted jobs)", () => {
    const f = providerFlags(act({ completed: 2, stale: 4, declined: 1 }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: "low_completion", severity: "high" });
    expect(f[0]!.message).toContain("finishes only 33%");
  });
  it("does not flag a pro with too little history, a good record, or a low acceptance rate", () => {
    expect(providerFlags(act({ completed: 1, stale: 3 }))).toEqual([]);          // only 4 accepted
    expect(providerFlags(act({ completed: 8, stale: 1 }))).toEqual([]);          // completes 89%
    expect(providerFlags(act({ completed: 2, stale: 4, declined: 12 }))).toMatchObject([{ code: "repeated_declines" }]); // acceptance only 33%
  });
  it("flags repeated declines as a watch item", () => {
    const f = providerFlags(act({ declined: 6, completed: 2 }));
    expect(f).toEqual([expect.objectContaining({ code: "repeated_declines", severity: "watch" })]);
  });
  it("a pro can carry both flags", () => {
    const f = providerFlags(act({ completed: 2, stale: 5, declined: 7 }));
    expect(f.map((x) => x.code)).toEqual(["repeated_declines"]); // acceptance 50% < 80%: only the decline flag
    expect(providerFlags(act({ completed: 2, stale: 6, declined: 1 })).map((x) => x.code)).toEqual(["low_completion"]);
  });
});

describe("flaggedProviders", () => {
  it("lists only flagged pros, serious ones first", () => {
    const all = summariseProviderActivity([
      ...rows("good", { completed: 9 }),
      ...rows("decliner", { declined: 7, completed: 1 }),
      ...rows("bad", { completed: 1, stale: 6 }),
    ], now);
    expect(flaggedProviders(all).map((x) => x.activity.providerId)).toEqual(["bad", "decliner"]);
  });
});
