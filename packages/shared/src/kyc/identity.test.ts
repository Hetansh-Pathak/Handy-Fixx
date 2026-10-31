import { describe, expect, it } from "vitest";
import { bankNameMatch, blindIndexInput, maskPanLast4, normalizeBankName, normalizePan, normalizePhone, panLast4 } from "./identity";

describe("PAN normalisation and masking", () => {
  it("normalises what people type", () => {
    expect(normalizePan(" abcde-1234 f ")).toBe("ABCDE1234F");
    expect(normalizePan("ABCDE1234F")).toBe("ABCDE1234F");
  });
  it("keeps only the last 4 characters", () => {
    expect(panLast4("abcde1234f")).toBe("234F");
    expect(panLast4(" ABCDE-1234F ")).toBe("234F");
  });
  it("shows a saved PAN as XXXXXX + last 4, never more", () => {
    expect(maskPanLast4("234F")).toBe("XXXXXX234F");
    expect(maskPanLast4(null)).toBe("Not added");
    expect(maskPanLast4("ABCDE1234F")).toBe("Not added"); // a full PAN is never rendered, even by mistake
    expect(maskPanLast4("12")).toBe("Not added");
  });
});

describe("blind-index inputs (the same strings the Edge Function hashes; see supabase/tests/security/edge/kyc.test.ts)", () => {
  it("pan", () => expect(blindIndexInput("pan", " abcde 1234 f")).toBe("pan|v1|ABCDE1234F"));
  it("phone: the last ten digits", () => {
    expect(blindIndexInput("phone", "+91 98250-12345")).toBe("phone|v1|9825012345");
    expect(normalizePhone("098250 12345")).toBe("9825012345");
  });
  it("bank account name: letters only, single spaces", () => {
    expect(blindIndexInput("bank_account_name", "  Ravi  K. Patel ")).toBe("bank_account_name|v1|RAVI K PATEL");
    expect(normalizeBankName("shri-ram")).toBe("SHRI RAM");
  });
  it("a different PAN gives a different input", () => {
    expect(blindIndexInput("pan", "ABCDE1234G")).not.toBe(blindIndexInput("pan", "ABCDE1234F"));
  });
});

describe("bankNameMatch (a hint for the admin, never an automatic decision)", () => {
  it("same name, any order, case or titles", () => {
    expect(bankNameMatch("Ramesh Patel", "RAMESH PATEL")).toBe("match");
    expect(bankNameMatch("Ramesh Patel", "Patel Ramesh")).toBe("match");
    expect(bankNameMatch("Ramesh Patel", "Mr. Ramesh Patel")).toBe("match");
  });
  it("initials and a missing middle name", () => {
    expect(bankNameMatch("Ramesh Kantilal Patel", "Ramesh Patel")).toBe("match");
    expect(bankNameMatch("Ramesh Patel", "R Patel")).toBe("match");
  });
  it("one shared word is only partial: a person decides", () => {
    expect(bankNameMatch("Ramesh Patel", "Ramesh Shah")).toBe("partial");
    expect(bankNameMatch("Ramesh Patel", "Sunita Patel")).toBe("partial");
  });
  it("different people", () => {
    expect(bankNameMatch("Ramesh Patel", "Jayesh Mehta")).toBe("mismatch");
    expect(bankNameMatch("Ramesh Patel", "R S Mehta")).toBe("mismatch");
  });
  it("an initial matches one word only, and initials alone are not enough", () => {
    expect(bankNameMatch("Ravi Rajesh", "R Patel")).toBe("mismatch");
    expect(bankNameMatch("Ravi Rajesh", "R R")).toBe("partial");
  });
  it("unknown when a name is missing", () => {
    expect(bankNameMatch("Ramesh Patel", "")).toBe("unknown");
    expect(bankNameMatch(null, "Ramesh Patel")).toBe("unknown");
    expect(bankNameMatch("Mr", "Ramesh")).toBe("unknown");
  });
});
