import { describe, it, expect } from "vitest";
import { EMPTY_FIELDS, isValidPhone, validateProfile } from "@/lib/profileForm";

describe("isValidPhone", () => {
  it("accepts 10 digits with common prefixes and spacing", () => {
    for (const ok of ["9876543210", "98765 43210", "+91 98765 43210", "+919876543210", "09876543210"]) {
      expect(isValidPhone(ok)).toBe(true);
    }
  });
  it("rejects too short or too long numbers", () => {
    for (const bad of ["", "12345", "987654321", "9876543210123"]) expect(isValidPhone(bad)).toBe(false);
  });
});

describe("validateProfile", () => {
  const ok = { ...EMPTY_FIELDS, name: "Asha Patel" };

  it("needs a name of at least 2 characters", () => {
    expect(validateProfile(EMPTY_FIELDS).name).toBeTruthy();
    expect(validateProfile({ ...ok, name: " A " }).name).toBeTruthy();
    expect(validateProfile(ok)).toEqual({});
  });

  it("treats the phone as optional but validates it when present", () => {
    expect(validateProfile({ ...ok, phone: "" }).phone).toBeUndefined();
    expect(validateProfile({ ...ok, phone: "12345" }).phone).toBeTruthy();
    expect(validateProfile({ ...ok, phone: "98765 43210" }).phone).toBeUndefined();
  });

  it("requires a full 6-digit pincode when one is entered", () => {
    expect(validateProfile({ ...ok, pincode: "3600" }).pincode).toBeTruthy();
    expect(validateProfile({ ...ok, pincode: "361001" }).pincode).toBeUndefined();
    expect(validateProfile({ ...ok, pincode: "" }).pincode).toBeUndefined();
  });
});
