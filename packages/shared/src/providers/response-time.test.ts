import { describe, expect, it } from "vitest";
import { MIN_RESPONSE_SAMPLES, formatResponseTime, responseTimeMap } from "./response-time";

describe("formatResponseTime", () => {
  it("speaks in plain words", () => {
    expect(formatResponseTime(20, 10)).toBe("Replies in under a minute");
    expect(formatResponseTime(60, 10)).toBe("Replies in about 1 min");
    expect(formatResponseTime(150, 10)).toBe("Replies in about 3 min");
    expect(formatResponseTime(3600, 10)).toBe("Replies in about 1 h");
    expect(formatResponseTime(30 * 3600, 10)).toBe("Replies within a day");
  });
  it("shows nothing without enough samples or a usable number", () => {
    expect(formatResponseTime(30, MIN_RESPONSE_SAMPLES - 1)).toBeNull();
    for (const v of [null, undefined, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatResponseTime(v as number, 10)).toBeNull();
  });
});

describe("responseTimeMap", () => {
  it("keeps rows with enough samples and reads numeric strings", () => {
    const m = responseTimeMap([
      { provider_id: "a", avg_seconds: "42.5", samples: "7" },
      { provider_id: "b", avg_seconds: 10, samples: 2 },
      { provider_id: "c", avg_seconds: null, samples: 9 },
      { provider_id: 5, avg_seconds: 1, samples: 9 },
      null,
    ]);
    expect([...m.entries()]).toEqual([["a", 42.5]]);
  });
  it("copes with anything that is not a list", () => {
    for (const v of [null, undefined, {}, "x", 3]) expect(responseTimeMap(v).size).toBe(0);
  });
});
