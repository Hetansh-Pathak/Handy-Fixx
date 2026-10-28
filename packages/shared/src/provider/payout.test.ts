import { describe, expect, it } from "vitest";
import { fieldErrors } from "../auth/schemas";
import { payoutDetailsSchema, payoutSummary, toPayoutPatch, type PayoutDetailsInput } from "./payout";

const empty: PayoutDetailsInput = { upiId: "", bankAccountName: "", bankAccountNumber: "", bankIfsc: "" };
const bank = { bankAccountName: "Ravi Patel", bankAccountNumber: "1234 5678 9012", bankIfsc: "sbin0001234" };

describe("payoutDetailsSchema", () => {
  it("needs at least one place to send money", () => {
    const r = payoutDetailsSchema.safeParse(empty);
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).upiId).toMatch(/UPI ID or your bank/i);
  });

  it("accepts a UPI ID alone and trims it", () => {
    const p = payoutDetailsSchema.parse({ ...empty, upiId: " ravi.p@okaxis " });
    expect(p.upiId).toBe("ravi.p@okaxis");
    expect(p.bankAccountNumber).toBe("");
  });

  it("rejects a UPI ID without the @bank part", () => {
    const r = payoutDetailsSchema.safeParse({ ...empty, upiId: "ravi" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).upiId).toMatch(/name@bank/);
  });

  it("accepts complete bank details, removing spaces and upper-casing the IFSC", () => {
    const p = payoutDetailsSchema.parse({ ...empty, ...bank });
    expect([p.bankAccountNumber, p.bankIfsc]).toEqual(["123456789012", "SBIN0001234"]);
  });

  it("asks for every bank field once one is filled", () => {
    const r = payoutDetailsSchema.safeParse({ ...empty, bankAccountNumber: "1234" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["bankAccountName", "bankAccountNumber", "bankIfsc"]);
  });

  it("rejects an account number that is too short, too long or not digits", () => {
    for (const n of ["12345678", "1234567890123456789", "12345abc9012"]) {
      expect(payoutDetailsSchema.safeParse({ ...empty, ...bank, bankAccountNumber: n }).success).toBe(false);
    }
  });

  it("rejects a malformed IFSC", () => {
    for (const code of ["SBIN1001234", "SBI0001234", "SBIN000123", "1234S0001234"]) {
      expect(payoutDetailsSchema.safeParse({ ...empty, ...bank, bankIfsc: code }).success).toBe(false);
    }
  });

  it("accepts both UPI and bank together", () => {
    expect(payoutDetailsSchema.safeParse({ upiId: "ravi@okaxis", ...bank }).success).toBe(true);
  });
});

describe("toPayoutPatch", () => {
  it("writes empty fields as null so a removed destination is really cleared", () => {
    const p = payoutDetailsSchema.parse({ ...empty, upiId: "ravi@okaxis" });
    expect(toPayoutPatch(p)).toEqual({ upi_id: "ravi@okaxis", bank_account_name: null, bank_account_number: null, bank_ifsc: null });
  });
  it("keeps bank details", () => {
    const p = payoutDetailsSchema.parse({ ...empty, ...bank });
    expect(toPayoutPatch(p)).toEqual({
      upi_id: null, bank_account_name: "Ravi Patel", bank_account_number: "123456789012", bank_ifsc: "SBIN0001234",
    });
  });
});

describe("payoutSummary", () => {
  it("is not ready with nothing saved", () => {
    expect(payoutSummary({ upi_id: null, bank_account_name: null, bank_account_number: null, bank_ifsc: null })).toEqual({ upi: null, bank: null, ready: false });
  });
  it("shows UPI and a masked bank account", () => {
    const s = payoutSummary({ upi_id: "ravi@okaxis", bank_account_name: "Ravi Patel", bank_account_number: "123456789012", bank_ifsc: "SBIN0001234" });
    expect(s).toEqual({ upi: "ravi@okaxis", bank: "Ravi Patel · ••••9012 · SBIN0001234", ready: true });
  });
  it("does not count half a bank account as ready", () => {
    const s = payoutSummary({ upi_id: null, bank_account_name: "Ravi", bank_account_number: "123456789012", bank_ifsc: null });
    expect(s.ready).toBe(false);
    expect(s.bank).toBeNull();
  });
  it("treats blank strings as missing", () => {
    expect(payoutSummary({ upi_id: "  ", bank_account_name: "", bank_account_number: "", bank_ifsc: "" }).ready).toBe(false);
  });
});
