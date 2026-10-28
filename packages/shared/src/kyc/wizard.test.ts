import { describe, expect, it } from "vitest";
import {
  KYC_DOC_KEYS, formatDobInput, kycDocPath, kycFileExtension, kycMimeType, kycSaveErrorMessage, kycStatusView,
  fitWithin, parseDobInput, resumeKycStep, validateAllKycSteps, validateKycStep, type KycFacts,
} from "./wizard";

const NOW = new Date(2026, 10, 10);

// 234123412346 passes the Verhoeff check (see kyc.test.ts).
const good: KycFacts = {
  firstName: "Ramesh", lastName: "Patel", dob: "1990-03-05",
  aadhaarNumber: "234123412346", aadhaarOnFile: false, hasAadhaarFront: true,
  hasSelfie: true, panNumber: "ABCDE1234F", hasPanDoc: true,
  areas: ["Ahmedabad"], serviceIds: ["svc-1"], experienceYears: "5", bio: "", termsAccepted: true,
};

describe("validateKycStep", () => {
  it("accepts a complete application on every step", () => {
    for (let step = 1; step <= 9; step++) expect(validateKycStep(step, good, NOW)).toBeNull();
    expect(validateAllKycSteps(good, NOW)).toEqual([]);
  });

  it("step 1: both names, letters only", () => {
    expect(validateKycStep(1, { ...good, firstName: " " }, NOW)).toMatch(/first name/i);
    expect(validateKycStep(1, { ...good, lastName: "" }, NOW)).toMatch(/last name/i);
    expect(validateKycStep(1, { ...good, firstName: "R2" }, NOW)).toMatch(/letters/i);
    expect(validateKycStep(1, { ...good, firstName: "R" }, NOW)).toMatch(/at least 2/i);
    expect(validateKycStep(1, { ...good, lastName: "O'Neil-Rao" }, NOW)).toBeNull();
  });

  it("step 2: a real date and 18 or older", () => {
    expect(validateKycStep(2, { ...good, dob: "" }, NOW)).toMatch(/date of birth/i);
    expect(validateKycStep(2, { ...good, dob: "2001-02-30" }, NOW)).toMatch(/valid date/i);
    expect(validateKycStep(2, { ...good, dob: "2010-01-01" }, NOW)).toMatch(/18/);
    expect(validateKycStep(2, { ...good, dob: "2008-11-10" }, NOW)).toBeNull();
    expect(validateKycStep(2, { ...good, dob: "2008-11-11" }, NOW)).toMatch(/18/);
  });

  it("step 3: a valid Aadhaar (or one already saved) and the front photo", () => {
    expect(validateKycStep(3, { ...good, aadhaarNumber: "" }, NOW)).toMatch(/aadhaar number/i);
    expect(validateKycStep(3, { ...good, aadhaarNumber: "234123412347" }, NOW)).toMatch(/check/i);
    expect(validateKycStep(3, { ...good, aadhaarNumber: "2341" }, NOW)).toMatch(/12/);
    expect(validateKycStep(3, { ...good, aadhaarNumber: "", aadhaarOnFile: true }, NOW)).toBeNull();
    expect(validateKycStep(3, { ...good, hasAadhaarFront: false }, NOW)).toMatch(/front/i);
    // A typo must still be rejected even when an Aadhaar is already on file.
    expect(validateKycStep(3, { ...good, aadhaarNumber: "234123412347", aadhaarOnFile: true }, NOW)).toMatch(/check/i);
  });

  it("step 4: a selfie", () => {
    expect(validateKycStep(4, { ...good, hasSelfie: false }, NOW)).toMatch(/selfie/i);
  });

  it("step 5: PAN format (case-insensitive) and the card photo", () => {
    expect(validateKycStep(5, { ...good, panNumber: "" }, NOW)).toMatch(/pan number/i);
    expect(validateKycStep(5, { ...good, panNumber: "abcde1234f" }, NOW)).toBeNull();
    expect(validateKycStep(5, { ...good, panNumber: "ABCDE12345" }, NOW)).toMatch(/format/i);
    expect(validateKycStep(5, { ...good, hasPanDoc: false }, NOW)).toMatch(/photo of your pan card/i);
  });

  it("step 6 and 7: at least one area and one service", () => {
    expect(validateKycStep(6, { ...good, areas: [] }, NOW)).toMatch(/city/i);
    expect(validateKycStep(7, { ...good, serviceIds: [] }, NOW)).toMatch(/service/i);
  });

  it("step 7: experience is whole years 0 to 60", () => {
    expect(validateKycStep(7, { ...good, experienceYears: "" }, NOW)).toMatch(/experience/i);
    expect(validateKycStep(7, { ...good, experienceYears: "61" }, NOW)).toMatch(/0 and 60/);
    expect(validateKycStep(7, { ...good, experienceYears: "2.5" }, NOW)).toMatch(/whole/);
    expect(validateKycStep(7, { ...good, experienceYears: "0" }, NOW)).toBeNull();
  });

  it("step 8 is optional but the bio has a limit", () => {
    expect(validateKycStep(8, { ...good, bio: "" }, NOW)).toBeNull();
    expect(validateKycStep(8, { ...good, bio: "x".repeat(301) }, NOW)).toMatch(/300/);
  });

  it("step 9: the agreement must be accepted", () => {
    expect(validateKycStep(9, { ...good, termsAccepted: false }, NOW)).toMatch(/agree/i);
  });

  it("rejects a step outside 1 to 9", () => {
    expect(validateKycStep(0, good, NOW)).toMatch(/step/i);
    expect(validateKycStep(10, good, NOW)).toMatch(/step/i);
  });
});

describe("validateAllKycSteps", () => {
  it("lists every broken step in order, so the review screen can send the pro back to it", () => {
    const bad: KycFacts = { ...good, lastName: "", hasSelfie: false, areas: [], termsAccepted: false };
    expect(validateAllKycSteps(bad, NOW).map((p) => p.step)).toEqual([1, 4, 6, 9]);
  });
});

describe("resumeKycStep", () => {
  it("starts at 1 for a new or rejected application", () => {
    expect(resumeKycStep(null, "not_submitted")).toBe(1);
    expect(resumeKycStep(0, "not_submitted")).toBe(1);
    expect(resumeKycStep(7, "rejected")).toBe(1);
  });
  it("continues where the pro stopped, never past the last step", () => {
    expect(resumeKycStep(4, "not_submitted")).toBe(4);
    expect(resumeKycStep(99, "not_submitted")).toBe(9);
    expect(resumeKycStep(-3, "not_submitted")).toBe(1);
  });
});

describe("kycStatusView", () => {
  it("not started", () => {
    const v = kycStatusView("not_submitted", null, 1);
    expect(v.action).toBe("start");
    expect(v.tone).toBe("brand");
  });
  it("started but not finished", () => {
    expect(kycStatusView("not_submitted", null, 5).action).toBe("resume");
  });
  it("under review", () => {
    const v = kycStatusView("pending", null, 9);
    expect(v.action).toBe("wait");
    expect(v.note).toMatch(/1.2 working days/);
  });
  it("rejected shows the admin's reason", () => {
    const v = kycStatusView("rejected", "Selfie unclear", 9);
    expect(v.action).toBe("fix");
    expect(v.tone).toBe("danger");
    expect(v.note).toContain("Selfie unclear");
  });
  it("rejected without a reason still tells the pro what to do", () => {
    expect(kycStatusView("rejected", "  ", 9).note).toMatch(/re-?upload|correct/i);
  });
  it("approved needs nothing", () => {
    expect(kycStatusView("approved", null, 9).action).toBe("none");
  });
  it("unknown values are treated as not started", () => {
    expect(kycStatusView("weird", null, 1).action).toBe("start");
    expect(kycStatusView(null, null, null).action).toBe("start");
  });
});

describe("date of birth input", () => {
  it("formats while typing", () => {
    expect(formatDobInput("0")).toBe("0");
    expect(formatDobInput("05")).toBe("05");
    expect(formatDobInput("050")).toBe("05/0");
    expect(formatDobInput("0503")).toBe("05/03");
    expect(formatDobInput("05031")).toBe("05/03/1");
    expect(formatDobInput("05/03/1990")).toBe("05/03/1990");
    expect(formatDobInput("05031990999")).toBe("05/03/1990");
    expect(formatDobInput("ab05-03-1990")).toBe("05/03/1990");
  });
  it("parses DD/MM/YYYY into yyyy-MM-dd", () => {
    expect(parseDobInput("05/03/1990")).toBe("1990-03-05");
    expect(parseDobInput("29/02/2000")).toBe("2000-02-29");
  });
  it("returns null for anything incomplete or impossible", () => {
    for (const bad of ["", "05/03", "05/03/90", "31/04/1990", "29/02/2001", "00/01/1990", "01/13/1990", "01/01/1899"]) {
      expect(parseDobInput(bad)).toBeNull();
    }
  });
});

describe("kyc documents", () => {
  it("has the five document keys", () => {
    expect(KYC_DOC_KEYS).toEqual(["aadhaar_front", "aadhaar_back", "selfie", "pan", "certificate"]);
  });
  it("stores under the pro's own auth id folder, which the storage rule requires", () => {
    expect(kycDocPath("user-1", "selfie", "image/jpeg", 123)).toBe("user-1/selfie_123.jpg");
    expect(kycDocPath("user-1", "pan", "image/png", 5)).toBe("user-1/pan_5.png");
    expect(kycDocPath("user-1", "aadhaar_front", "image/webp", 5)).toBe("user-1/aadhaar_front_5.webp");
  });
  it("maps mime types to extensions", () => {
    expect(kycFileExtension("image/jpeg")).toBe("jpg");
    expect(kycFileExtension("application/pdf")).toBe("pdf");
    expect(kycFileExtension("image/gif")).toBeNull();
  });
  it("works out the mime type from the picker, falling back to the file name", () => {
    expect(kycMimeType("image/png", "file:///a/b.jpg")).toBe("image/png");
    expect(kycMimeType(null, "file:///a/b.JPG")).toBe("image/jpeg");
    expect(kycMimeType(undefined, "file:///a/b.jpeg?x=1")).toBe("image/jpeg");
    expect(kycMimeType(null, "blob:http://x/abc")).toBeNull();
    expect(kycMimeType("", "x.webp")).toBe("image/webp");
  });
});

describe("kycSaveErrorMessage", () => {
  it("explains a duplicate Aadhaar or PAN", () => {
    expect(kycSaveErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "provider_kyc_aadhaar_hash_key"' })).toMatch(/aadhaar.*already/i);
    expect(kycSaveErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "provider_kyc_pan_unique"' })).toMatch(/pan.*already/i);
  });
  it("never shows a raw database message", () => {
    const m = kycSaveErrorMessage({ code: "XX000", message: "relation \"provider_kyc\" does not exist" });
    expect(m).not.toMatch(/relation/);
    expect(m).toMatch(/try again/i);
  });
  it("passes the readable P0001 rules through", () => {
    expect(kycSaveErrorMessage({ code: "P0001", message: "Cannot change kyc_status directly." })).toBe("Cannot change kyc_status directly.");
  });
  it("describes a lost connection", () => {
    expect(kycSaveErrorMessage({ message: "Network request failed" })).toMatch(/internet/i);
  });
});

describe("fitWithin", () => {
  it("shrinks the long side to the limit and keeps the shape", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it("leaves small or unknown sizes alone", () => {
    expect(fitWithin(1200, 800, 1600)).toBeNull();
    expect(fitWithin(1600, 1600, 1600)).toBeNull();
    expect(fitWithin(0, 0, 1600)).toBeNull();
    expect(fitWithin(Number.NaN, 100, 1600)).toBeNull();
  });
});
