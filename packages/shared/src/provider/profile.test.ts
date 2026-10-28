import { describe, expect, it } from "vitest";
import { fieldErrors } from "../auth/schemas";
import {
  addServiceArea, isProviderIdentityLocked, maskAccountNumber, MAX_SERVICE_AREAS, normalizeServiceArea,
  providerProfileSchema, suggestCities, toProviderProfilePatch, type ProviderProfileInput,
} from "./profile";

const SERVICE = "6f1c2a52-8d2b-4c55-9a3e-0b7a1f2e3d4c";

const valid: ProviderProfileInput = {
  fullName: " Ravi Patel ",
  phone: "+91 98765 43210",
  bio: "  ",
  experienceYears: "5",
  city: "surat",
  serviceAreas: ["Surat", "395007"],
  serviceIds: [SERVICE],
  upiId: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
};

describe("normalizeServiceArea", () => {
  it("keeps a 6-digit pincode", () => expect(normalizeServiceArea(" 380015 ")).toBe("380015"));
  it("spells a city the catalogue way", () => expect(normalizeServiceArea("  jam   khambhalia ")).toBe("Jam Khambhalia"));
  it.each(["", "Mumbai", "38001", "3800155"])("rejects %j", (v) => expect(normalizeServiceArea(v)).toBeNull());
});

describe("addServiceArea", () => {
  it("adds a new area", () => expect(addServiceArea(["Surat"], "vadodara")).toEqual({ ok: true, areas: ["Surat", "Vadodara"] }));
  it("refuses duplicates in any case", () => expect(addServiceArea(["Surat"], "SURAT").ok).toBe(false));
  it("refuses unknown places", () => expect(addServiceArea([], "Pune").ok).toBe(false));
  it("caps the list", () => {
    const full = Array.from({ length: MAX_SERVICE_AREAS }, (_, i) => String(380000 + i));
    expect(addServiceArea(full, "Surat")).toEqual({ ok: false, error: `You can cover up to ${MAX_SERVICE_AREAS} areas.` });
  });
});

describe("suggestCities", () => {
  it("matches by prefix and skips taken cities", () => {
    expect(suggestCities("BA", ["bavla"])).toEqual(["Bagasara", "Bayad", "Balasinor", "Bardoli"]);
  });
  it("waits for two letters", () => expect(suggestCities("s")).toEqual([]));
  it("respects the limit", () => expect(suggestCities("ba", [], 2)).toHaveLength(2));
});

describe("isProviderIdentityLocked", () => {
  it.each([["pending", true], ["approved", true], ["not_submitted", false], ["rejected", false], [null, false]])(
    "%s → %s", (s, locked) => expect(isProviderIdentityLocked(s)).toBe(locked),
  );
});

describe("providerProfileSchema", () => {
  it("normalises a valid profile", () => {
    expect(providerProfileSchema.parse(valid)).toEqual({
      fullName: "Ravi Patel", phone: "9876543210", bio: null, experienceYears: 5, city: "Surat",
      serviceAreas: ["Surat", "395007"], serviceIds: [SERVICE], upiId: null,
      bankAccountName: null, bankAccountNumber: "", bankIfsc: "",
    });
  });

  it("needs at least one area and one service", () => {
    const r = providerProfileSchema.safeParse({ ...valid, serviceAreas: [], serviceIds: [] });
    if (r.success) throw new Error("should fail");
    expect(fieldErrors(r.error)).toEqual({
      serviceAreas: "Add at least one city or pincode you cover",
      serviceIds: "Pick at least one service you offer",
    });
  });

  it.each(["-1", "2.5", "61", "abc"])("rejects experience %j", (y) => {
    expect(providerProfileSchema.safeParse({ ...valid, experienceYears: y }).success).toBe(false);
  });

  it("treats blank experience as 0 and blank city as none", () => {
    const p = providerProfileSchema.parse({ ...valid, experienceYears: " ", city: "" });
    expect([p.experienceYears, p.city]).toEqual([0, null]);
  });

  it("rejects a city outside the list or a pincode as base city", () => {
    expect(providerProfileSchema.safeParse({ ...valid, city: "Pune" }).success).toBe(false);
    expect(providerProfileSchema.safeParse({ ...valid, city: "380015" }).success).toBe(false);
  });

  it("checks the UPI ID", () => {
    expect(providerProfileSchema.parse({ ...valid, upiId: " ravi.p@okaxis " }).upiId).toBe("ravi.p@okaxis");
    expect(providerProfileSchema.safeParse({ ...valid, upiId: "ravi" }).success).toBe(false);
  });

  it("requires all bank fields once one is filled", () => {
    const r = providerProfileSchema.safeParse({ ...valid, bankAccountNumber: "1234" });
    if (r.success) throw new Error("should fail");
    expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["bankAccountName", "bankAccountNumber", "bankIfsc"]);
  });

  it("accepts complete bank details and upper-cases the IFSC", () => {
    const p = providerProfileSchema.parse({ ...valid, bankAccountName: "Ravi Patel", bankAccountNumber: "1234 5678 9012", bankIfsc: "sbin0001234" });
    expect([p.bankAccountNumber, p.bankIfsc]).toEqual(["123456789012", "SBIN0001234"]);
  });
});

describe("toProviderProfilePatch", () => {
  const profile = providerProfileSchema.parse(valid);

  it("maps to service_providers columns", () => {
    expect(toProviderProfilePatch(profile, false)).toEqual({
      full_name: "Ravi Patel", phone: "9876543210", bio: null, experience_years: 5, city: "Surat",
      pincodes: ["Surat", "395007"], service_ids: [SERVICE], upi_id: null,
      bank_account_name: null, bank_account_number: null, bank_ifsc: null,
    });
  });

  it("leaves name and mobile out while identity is locked", () => {
    const patch = toProviderProfilePatch(profile, true);
    expect(patch).not.toHaveProperty("full_name");
    expect(patch).not.toHaveProperty("phone");
  });
});

describe("maskAccountNumber", () => {
  it("shows the last four digits", () => expect(maskAccountNumber("123456789012")).toBe("••••9012"));
  it("hides nothing it does not have", () => expect(maskAccountNumber(null)).toBeNull());
});
