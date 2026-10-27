import { describe, expect, it } from "vitest";
import { homeRouteFor, isAppRole, needsRolePick, requiresBackgroundLocation } from "./roles";

describe("roles", () => {
  it("recognises app roles (admin is web-only)", () => {
    expect(isAppRole("customer")).toBe(true);
    expect(isAppRole("provider")).toBe(true);
    expect(isAppRole("admin")).toBe(false);
    expect(isAppRole(undefined)).toBe(false);
  });
  it("one role per account: pick once, then route to the matching group", () => {
    expect(needsRolePick(null)).toBe(true);
    expect(needsRolePick(undefined)).toBe(true);
    expect(needsRolePick("customer")).toBe(false);
    expect(homeRouteFor(null)).toBe("/role-pick");
    expect(homeRouteFor("customer")).toBe("/customer");
    expect(homeRouteFor("provider")).toBe("/provider");
  });
  it("asks for background location only for providers", () => {
    expect(requiresBackgroundLocation("provider")).toBe(true);
    expect(requiresBackgroundLocation("customer")).toBe(false);
  });
});
