import { describe, expect, it } from "vitest";
import { isRecoveryLink, parseAuthLink } from "./deep-link";

describe("parseAuthLink", () => {
  it("reads implicit-flow tokens from the fragment", () => {
    const p = parseAuthLink("handyfix://reset-password#access_token=abc.def&refresh_token=r123&expires_in=3600&type=recovery");
    expect(p).toEqual({ type: "recovery", accessToken: "abc.def", refreshToken: "r123", code: null, error: null });
    expect(isRecoveryLink(p)).toBe(true);
  });
  it("reads a PKCE code from the query string", () => {
    const p = parseAuthLink("handyfix://reset-password?code=pkce-1&type=recovery");
    expect(p.code).toBe("pkce-1");
    expect(isRecoveryLink(p)).toBe(true);
  });
  it("prefers the fragment over the query when both exist", () => {
    expect(parseAuthLink("handyfix://x?type=signup#type=recovery&access_token=a&refresh_token=b").type).toBe("recovery");
  });
  it("decodes percent-escapes and plus signs in errors", () => {
    const p = parseAuthLink("handyfix://reset-password#error=access_denied&error_description=Email+link+is+invalid+or+has+expired");
    expect(p.error).toBe("Email link is invalid or has expired");
    expect(isRecoveryLink(p)).toBe(false);
  });
  it("is not a recovery link without tokens or with another type", () => {
    expect(isRecoveryLink(parseAuthLink("handyfix://reset-password#type=recovery"))).toBe(false);
    expect(isRecoveryLink(parseAuthLink("handyfix://x#access_token=a&refresh_token=b&type=signup"))).toBe(false);
    expect(isRecoveryLink(parseAuthLink("handyfix://x#access_token=a&type=recovery"))).toBe(false);
  });
  it.each([null, undefined, "", "handyfix://reset-password", "garbage#", "a?&&=&#&"])("returns empty params for %j", (url) => {
    expect(parseAuthLink(url as string)).toEqual({ type: null, accessToken: null, refreshToken: null, code: null, error: null });
  });
  it("survives malformed escapes", () => {
    expect(parseAuthLink("handyfix://x#access_token=%E0%A4%A&refresh_token=r&type=recovery").accessToken).toBe("%E0%A4%A");
  });
});
