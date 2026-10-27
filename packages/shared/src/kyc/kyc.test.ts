import { describe, expect, it } from "vitest";
import {
  isAdult, KYC_MAX_FILE_SIZE, KYC_STEP_LABELS, KYC_TOTAL_STEPS, maskAadhaar, maskPAN, normalizeAadhaar,
  validateAadhaar, validateKycFile, validatePAN,
} from "./kyc";

// Build valid Aadhaar-shaped numbers independently of the validator (Verhoeff check-digit generation).
const MUL = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0],
];
const PERM = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const INV = [0,4,3,2,1,5,6,7,8,9];
function withCheckDigit(first11: string): string {
  let c = 0;
  [...first11].reverse().forEach((ch, i) => { c = MUL[c]![PERM[(i + 1) % 8]![Number(ch)]!]!; });
  return first11 + INV[c];
}

describe("Aadhaar", () => {
  const valid = withCheckDigit("23412341234");
  it("accepts numbers with a valid Verhoeff check digit, with or without spaces", () => {
    expect(validateAadhaar(valid)).toBe(true);
    expect(validateAadhaar(`${valid.slice(0, 4)} ${valid.slice(4, 8)} ${valid.slice(8)}`)).toBe(true);
    expect(normalizeAadhaar("2341 2341-2346")).toBe("234123412346");
  });
  it("rejects a wrong check digit, wrong length and non-digits", () => {
    const wrong = valid.slice(0, 11) + ((Number(valid[11]) + 1) % 10);
    expect(validateAadhaar(wrong)).toBe(false);
    expect(validateAadhaar(valid.slice(0, 11))).toBe(false);
    expect(validateAadhaar(valid + "0")).toBe(false);
    expect(validateAadhaar("abcdefghijkl")).toBe(false);
  });
  it("catches any single-digit typo", () => {
    for (let i = 0; i < 12; i++) {
      const d = (Number(valid[i]) + 1) % 10;
      expect(validateAadhaar(valid.slice(0, i) + d + valid.slice(i + 1))).toBe(false);
    }
  });
  it("masks to the last 4", () => expect(maskAadhaar("1234")).toBe("XXXX XXXX 1234"));
});

describe("PAN", () => {
  it("validates the AAAAA9999A format", () => {
    expect(validatePAN("ABCDE1234F")).toBe(true);
    for (const bad of ["abcde1234f", "ABCD1234FG", "ABCDE12345", "ABCDE1234", "ABCDE1234FF"]) expect(validatePAN(bad)).toBe(false);
  });
  it("masks the first five characters", () => {
    expect(maskPAN("ABCDE1234F")).toBe("XXXXX1234F");
    expect(maskPAN("short")).toBe("short");
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
    expect(KYC_TOTAL_STEPS).toBe(9);
  });
});
