import { describe, expect, it } from "vitest";
import { DELETE_CONFIRM_WORD, deletionBlockers, deletionErrorMessage, isDeleteConfirmed } from "./deletion";

describe("isDeleteConfirmed", () => {
  it("needs the word DELETE, in any case, ignoring spaces", () => {
    expect(DELETE_CONFIRM_WORD).toBe("DELETE");
    for (const ok of ["DELETE", "delete", "  Delete  "]) expect(isDeleteConfirmed(ok)).toBe(true);
    for (const bad of ["", "del", "deleted", "DELETE ME", "remove"]) expect(isDeleteConfirmed(bad)).toBe(false);
  });
});

describe("deletionBlockers", () => {
  it("has none for a customer with nothing in progress", () => {
    expect(deletionBlockers({ role: "customer", activeBookings: 0 })).toEqual([]);
  });
  it("asks a customer to finish or cancel active bookings", () => {
    const b = deletionBlockers({ role: "customer", activeBookings: 2 });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatch(/2 bookings/);
  });
  it("uses the singular for one booking", () => {
    expect(deletionBlockers({ role: "customer", activeBookings: 1 })[0]).toMatch(/1 booking /);
  });
  it("asks a pro to clear dues and withdraw the balance", () => {
    const b = deletionBlockers({ role: "provider", activeBookings: 0, walletBalance: 240, walletDue: 30 });
    expect(b.some((m) => /due/i.test(m))).toBe(true);
    expect(b.some((m) => /withdraw/i.test(m))).toBe(true);
  });
  it("lets a pro with a zero wallet go", () => {
    expect(deletionBlockers({ role: "provider", activeBookings: 0, walletBalance: 0, walletDue: 0 })).toEqual([]);
  });
  it("ignores wallet numbers for a customer", () => {
    expect(deletionBlockers({ role: "customer", activeBookings: 0, walletBalance: 500, walletDue: 50 })).toEqual([]);
  });
});

describe("deletionErrorMessage", () => {
  it("passes through readable reasons from the server", () => {
    expect(deletionErrorMessage("You have 1 active booking.")).toBe("You have 1 active booking.");
  });
  it("hides technical text and says what to do", () => {
    const m = deletionErrorMessage("FunctionsFetchError: Failed to send a request to the Edge Function");
    expect(m).not.toMatch(/Edge Function/);
    expect(m).toMatch(/email/i);
  });
  it("copes with nothing", () => expect(deletionErrorMessage(undefined)).toMatch(/email/i));
});
