import { describe, expect, it } from "vitest";
import {
  isAdult, KYC_MAX_FILE_SIZE, KYC_REJECTION_REASONS, KYC_STEP_LABELS, KYC_TOTAL_STEPS, validateKycFile, validatePAN,
} from "./kyc";

describe("PAN", () => {
  it("validates the AAAAA9999A format", () => {
    expect(validatePAN("ABCDE1234F")).toBe(true);
    for (const bad of ["abcde1234f", "ABCD1234FG", "ABCDE12345", "ABCDE1234", "ABCDE1234FF"]) expect(validatePAN(bad)).toBe(false);
  });
});

describe("Aadhaar is gone", () => {
  it("the package exports no Aadhaar helper, salt or hash", async () => {
    const all = (await import("../index")) as Record<string, unknown>;
    expect(Object.keys(all).filter((k) => /aadhaar/i.test(k))).toEqual([]);
    expect(Object.keys(all)).not.toContain("sha256Hex");
  });
  it("no step label or rejection reason mentions Aadhaar", () => {
    expect(Object.values(KYC_STEP_LABELS).join(" ")).not.toMatch(/aadhaar/i);
    expect(KYC_REJECTION_REASONS.join(" ")).not.toMatch(/aadhaar/i);
  });
});

describe("validateKycFile", () => {
  it("works for browser files and React Native picker assets", () => {
    expect(validateKycFile({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateKycFile({ mimeType: "application/pdf", fileSize: 1000 })).toBeNull();
  });
  it("rejects bad types and oversized files", () => {
    expect(validateKycFile({ type: "image/gif", size: 10 })).toMatch(/Invalid file type/);
    expect(validateKycFile({ size: 10 })).toMatch(/Invalid file type/);
    expect(validateKycFile({ type: "image/png", size: KYC_MAX_FILE_SIZE + 1 })).toMatch(/too large/);
    expect(validateKycFile({ type: "image/png", size: KYC_MAX_FILE_SIZE })).toBeNull();
  });
});

describe("isAdult", () => {
  const now = new Date(2026, 10, 10);
  it("needs to be 18 on the day", () => {
    expect(isAdult("2008-11-10", now)).toBe(true);
    expect(isAdult("2008-11-11", now)).toBe(false);
    expect(isAdult("1990-01-01", now)).toBe(true);
  });
  it("rejects malformed and impossible dates", () => {
    for (const bad of ["", "10/11/2000", "2000-13-01", "2001-02-30", "2000-1-1"]) expect(isAdult(bad, now)).toBe(false);
  });
});

describe("kyc constants", () => {
  it("has a label for every step", () => {
    for (let i = 1; i <= KYC_TOTAL_STEPS; i++) expect(KYC_STEP_LABELS[i]).toBeTruthy();
    expect(KYC_TOTAL_STEPS).toBe(8);
  });
});
