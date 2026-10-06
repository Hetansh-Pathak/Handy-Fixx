import { describe, it, expect } from "vitest";
import { friendlyAuthError, isValidEmail } from "@/lib/authErrors";

describe("friendlyAuthError", () => {
  it("explains wrong credentials and offers a reset", () => {
    const r = friendlyAuthError({ message: "Invalid login credentials", code: "invalid_credentials" });
    expect(r.kind).toBe("invalid");
    expect(r.message).toContain("don't match");
  });

  it("flags an existing account so the UI can offer 'Log in instead'", () => {
    expect(friendlyAuthError({ message: "User already registered" }).kind).toBe("exists");
    expect(friendlyAuthError({ code: "user_already_exists", message: "x" }).kind).toBe("exists");
  });

  it("treats 429 and rate-limit codes as rate limiting", () => {
    expect(friendlyAuthError({ status: 429, message: "x" }).kind).toBe("rate");
    expect(friendlyAuthError({ code: "over_email_send_rate_limit", message: "x" }).kind).toBe("rate");
  });

  it("recognises offline / unreachable-server errors", () => {
    expect(friendlyAuthError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(friendlyAuthError({ message: "Load failed" }).kind).toBe("network");
  });

  it("maps weak and repeated passwords", () => {
    expect(friendlyAuthError({ code: "weak_password", message: "x" }).message).toContain("6 characters");
    expect(friendlyAuthError({ code: "same_password", message: "x" }).message).toContain("different");
  });

  it("falls back to the original message, then to a generic one", () => {
    expect(friendlyAuthError({ message: "Boom" }).message).toBe("Boom");
    expect(friendlyAuthError(undefined).message).toBe("Something went wrong. Try again.");
    expect(friendlyAuthError("weird").kind).toBe("other");
  });
});

describe("isValidEmail", () => {
  it("accepts normal addresses, trimmed", () => {
    expect(isValidEmail("name@example.com")).toBe(true);
    expect(isValidEmail("  a.b+c@mail.co.in ")).toBe(true);
  });
  it("rejects obvious typos", () => {
    for (const bad of ["", "name", "name@", "name@example", "a b@example.com", "@example.com"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});
