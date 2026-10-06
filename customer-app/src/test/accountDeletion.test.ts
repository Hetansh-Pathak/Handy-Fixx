import { describe, expect, it } from "vitest";
import { CONFIRM_PHRASE, deleteErrorMessage, isConfirmed, parseDeleteError } from "@/lib/accountDeletion";

describe("isConfirmed", () => {
  it("accepts the phrase regardless of case and surrounding spaces", () => {
    expect(isConfirmed("DELETE")).toBe(true);
    expect(isConfirmed("  delete ")).toBe(true);
  });
  it("rejects anything else", () => {
    for (const v of ["", "del", "DELETE ME", "delet e"]) expect(isConfirmed(v)).toBe(false);
  });
  it("matches the phrase the server expects", () => {
    expect(CONFIRM_PHRASE).toBe("DELETE");
  });
});

const httpError = (body: unknown) => ({ name: "FunctionsHttpError", context: { json: async () => body } });

describe("parseDeleteError", () => {
  it("reads the code from the function's JSON body", async () => {
    expect(await parseDeleteError(httpError({ error: "x", code: "active_booking" }))).toBe("active_booking");
    expect(await parseDeleteError(httpError({ error: "x", code: "provider_account" }))).toBe("provider_account");
  });
  it("maps a failed fetch to a network message", async () => {
    expect(await parseDeleteError({ name: "FunctionsFetchError" })).toBe("network");
  });
  it("falls back safely for unknown codes, non-JSON bodies and null", async () => {
    expect(await parseDeleteError(httpError({ code: "made_up" }))).toBe("unexpected");
    expect(await parseDeleteError({ context: { json: async () => { throw new Error("not json"); } } })).toBe("unexpected");
    expect(await parseDeleteError(null)).toBe("unexpected");
  });
  it("has a human message for every code", () => {
    for (const c of ["provider_account", "active_booking", "unpaid_booking", "step_failed", "confirm", "unauthorized", "network", "unexpected"] as const) {
      expect(deleteErrorMessage(c).length).toBeGreaterThan(10);
    }
  });
});
