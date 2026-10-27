import { describe, expect, it } from "vitest";
import {
  customerProfileSchema, fieldErrors, forgotPasswordSchema, friendlyAuthError, passwordSchema, providerPickSchema,
  resetPasswordSchema, signInSchema, signUpSchema,
} from "./schemas";

describe("passwordSchema", () => {
  it.each(["abcdefg1", "Password123", "a1a1a1a1"])("accepts %s", (p) => expect(passwordSchema.safeParse(p).success).toBe(true));
  it.each(["short1", "allletters", "12345678", "a1".repeat(40)])("rejects %s", (p) => expect(passwordSchema.safeParse(p).success).toBe(false));
});

describe("signUpSchema", () => {
  const valid = { fullName: "  Asha Patel ", email: "asha@example.com", password: "secret123", confirmPassword: "secret123" };
  it("accepts and trims", () => {
    expect(signUpSchema.parse(valid).fullName).toBe("Asha Patel");
  });
  it("flags a password mismatch on the confirm field", () => {
    const r = signUpSchema.safeParse({ ...valid, confirmPassword: "other123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toEqual({ confirmPassword: "Passwords do not match" });
  });
  it("reports one message per field", () => {
    const r = signUpSchema.safeParse({ fullName: "A", email: "nope", password: "x", confirmPassword: "" });
    if (r.success) throw new Error("should fail");
    const errs = fieldErrors(r.error);
    expect(Object.keys(errs).sort()).toEqual(["confirmPassword", "email", "fullName", "password"]);
  });
});

describe("sign-in, forgot and reset", () => {
  it("sign-in only needs a valid email and some password", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "bad" }).success).toBe(false);
  });
  it("reset requires a strong matching password", () => {
    expect(resetPasswordSchema.safeParse({ password: "newpass12", confirmPassword: "newpass12" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "newpass12", confirmPassword: "newpass13" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "weak", confirmPassword: "weak" }).success).toBe(false);
  });
});

describe("providerPickSchema", () => {
  it("requires and normalises a mobile number", () => {
    expect(providerPickSchema.parse({ phone: "+91 98765 43210" }).phone).toBe("9876543210");
    expect(providerPickSchema.safeParse({ phone: "" }).success).toBe(false);
    expect(providerPickSchema.safeParse({ phone: "12345" }).success).toBe(false);
  });
});

describe("customerProfileSchema", () => {
  it("turns blank optional fields into null", () => {
    expect(customerProfileSchema.parse({ fullName: "Asha", phone: "", address: "  ", city: "", pincode: "" }))
      .toEqual({ fullName: "Asha", phone: null, address: null, city: null, pincode: null });
  });
  it("normalises phone and keeps valid values", () => {
    expect(customerProfileSchema.parse({ fullName: "Asha", phone: "09876543210", address: " 12 MG Road ", city: "Gandhinagar", pincode: "382010" }))
      .toEqual({ fullName: "Asha", phone: "9876543210", address: "12 MG Road", city: "Gandhinagar", pincode: "382010" });
  });
  it("rejects bad phone, pincode and name", () => {
    const r = customerProfileSchema.safeParse({ fullName: "", phone: "123", address: "", city: "", pincode: "12" });
    if (r.success) throw new Error("should fail");
    expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["fullName", "phone", "pincode"]);
  });
});

describe("friendlyAuthError", () => {
  it.each([
    ["Invalid login credentials", "Wrong email or password."],
    ["Email not confirmed", "Please confirm your email first. Check your inbox for the link."],
    ["User already registered", "An account with this email already exists. Try signing in."],
    ["email rate limit exceeded", "Too many attempts. Please wait a minute and try again."],
    ["TypeError: Network request failed", "No internet connection. Check your network and try again."],
    ["New password should be different from the old password.", "Choose a password you have not used before."],
    ["Email link is invalid or has expired", "This link has expired. Request a new one."],
    [undefined, "Something went wrong. Please try again."],
    ["", "Something went wrong. Please try again."],
  ])("%s", (input, out) => expect(friendlyAuthError(input)).toBe(out));
  it("passes short unknown messages through and hides long ones", () => {
    expect(friendlyAuthError("Signups not allowed")).toBe("Signups not allowed");
    expect(friendlyAuthError("x".repeat(200))).toBe("Something went wrong. Please try again.");
  });
});
