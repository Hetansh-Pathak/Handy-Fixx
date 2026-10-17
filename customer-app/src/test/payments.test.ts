import { describe, expect, it } from "vitest";
import { formatRupees, parsePayError, payErrorMessage } from "@/lib/payments";

const httpError = (body: unknown) => ({ name: "FunctionsHttpError", context: { json: async () => body } });

describe("payments client helpers", () => {
  it("reads the machine-readable code from a failed Edge Function call", async () => {
    expect(await parsePayError(httpError({ error: "x", code: "not_completed" }))).toBe("not_completed");
    expect(await parsePayError(httpError({ error: "x", code: "made_up" }))).toBe("unexpected");
    expect(await parsePayError({ name: "FunctionsFetchError" })).toBe("network");
    expect(await parsePayError(null)).toBe("unexpected");
  });

  it("has a plain-language message for every code", () => {
    for (const c of ["not_found", "forbidden", "not_completed", "already_paid", "refunded", "bad_amount", "gateway", "config", "signature", "review", "unauthorized", "network", "script", "unexpected"] as const) {
      expect(payErrorMessage(c).length).toBeGreaterThan(10);
    }
  });

  it("formats rupees the Indian way", () => {
    expect(formatRupees(448)).toBe("₹448");
    expect(formatRupees(123456)).toBe("₹1,23,456");
    expect(formatRupees(99.5)).toBe("₹99.5");
  });
});
