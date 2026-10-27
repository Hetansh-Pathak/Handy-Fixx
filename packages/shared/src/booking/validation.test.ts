import { describe, expect, it } from "vitest";
import {
  bookingAddressSchema, canGoToStep2, canGoToStep3, emailOtpSchema, emailSchema, isValidPincode,
  newBookingInputSchema, normalizeIndianMobile, phoneSchema,
} from "./validation";

describe("pincode", () => {
  it.each(["380001", "000000"])("accepts %s", (p) => expect(isValidPincode(p)).toBe(true));
  it.each(["38000", "3800011", "38000a", " 380001", ""])("rejects %j", (p) => expect(isValidPincode(p)).toBe(false));
});

describe("phone", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["91-9876543210", "9876543210"],
    ["09876543210", "9876543210"],
  ])("normalises %s", (input, out) => {
    expect(normalizeIndianMobile(input)).toBe(out);
    expect(phoneSchema.parse(input)).toBe(out);
  });
  it.each(["1234567890", "98765", "abcdefghij", "", "+1 202 555 0100"])("rejects %j", (input) => {
    expect(normalizeIndianMobile(input)).toBeNull();
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });
});

describe("email and otp", () => {
  it("validates", () => {
    expect(emailSchema.safeParse(" a@b.co ").success).toBe(true);
    expect(emailSchema.safeParse("nope").success).toBe(false);
    expect(emailOtpSchema.safeParse("123456").success).toBe(true);
    expect(emailOtpSchema.safeParse("12345").success).toBe(false);
    expect(emailOtpSchema.safeParse("12345a").success).toBe(false);
  });
});

describe("3-step booking", () => {
  const valid = {
    date: "2026-11-10", time: "12:00", address: " 12 MG Road ", city: "Gandhinagar", pincode: "382010",
  };
  it("accepts a complete booking and trims text", () => {
    const r = newBookingInputSchema.parse({ ...valid, notes: "  tap leaking  " });
    expect(r.address).toBe("12 MG Road");
    expect(r.notes).toBe("tap leaking");
  });
  it("gates the Next buttons like the old UI", () => {
    expect(canGoToStep2({ date: "2026-11-10", time: "12:00" })).toBe(true);
    expect(canGoToStep2({ date: "2026-11-10", time: "" })).toBe(false);
    expect(canGoToStep2({ date: "2026-11-10", time: "13:00" })).toBe(false); // not an offered slot
    expect(canGoToStep3(valid)).toBe(true);
    expect(canGoToStep3({ ...valid, pincode: "123" })).toBe(false);
    expect(canGoToStep3({ ...valid, address: "   " })).toBe(false);
  });
  it("rejects bad coordinates but allows none", () => {
    expect(bookingAddressSchema.safeParse({ ...valid, latitude: 91, longitude: 0 }).success).toBe(false);
    expect(bookingAddressSchema.safeParse({ ...valid, latitude: null, longitude: null }).success).toBe(true);
    expect(bookingAddressSchema.safeParse({ ...valid, latitude: 23.2, longitude: 72.6 }).success).toBe(true);
  });
  it("caps notes length", () => {
    expect(newBookingInputSchema.safeParse({ ...valid, notes: "x".repeat(1001) }).success).toBe(false);
  });
});
