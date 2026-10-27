import { describe, expect, it } from "vitest";
import { canBecomeProvider, readRoleFromMetadata, resolveAppRole, ROLE_METADATA_KEY } from "./session-role";

describe("readRoleFromMetadata", () => {
  it("reads a valid app role", () => {
    expect(readRoleFromMetadata({ [ROLE_METADATA_KEY]: "customer" })).toBe("customer");
    expect(readRoleFromMetadata({ [ROLE_METADATA_KEY]: "provider" })).toBe("provider");
  });
  it.each([null, undefined, "customer", 5, {}, { [ROLE_METADATA_KEY]: "admin" }, { [ROLE_METADATA_KEY]: 1 }, { role: "customer" }])(
    "ignores %j (admin can never be self-assigned)",
    (meta) => expect(readRoleFromMetadata(meta)).toBeNull(),
  );
});

describe("resolveAppRole (one role per account)", () => {
  it("a provider row always wins, even over a remembered customer role", () => {
    expect(resolveAppRole({ metadataRole: "customer", hasProviderRow: true })).toEqual({ role: "provider", source: "provider_row" });
    expect(resolveAppRole({ metadataRole: null, hasProviderRow: true })).toEqual({ role: "provider", source: "provider_row" });
  });
  it("uses the remembered customer role when there is no provider row", () => {
    expect(resolveAppRole({ metadataRole: "customer", hasProviderRow: false })).toEqual({ role: "customer", source: "metadata" });
  });
  it("sends a user back to finish pro sign-up if the provider row is missing", () => {
    expect(resolveAppRole({ metadataRole: "provider", hasProviderRow: false })).toEqual({ role: null, reason: "incomplete_provider" });
  });
  it("asks new users (and legacy customers with no role yet) to pick", () => {
    expect(resolveAppRole({ metadataRole: null, hasProviderRow: false })).toEqual({ role: null, reason: "not_picked" });
  });
});

describe("canBecomeProvider", () => {
  it("blocks accounts that already have customer bookings", () => {
    expect(canBecomeProvider({ customerBookingCount: 0 })).toEqual({ ok: true });
    expect(canBecomeProvider({ customerBookingCount: 1 })).toEqual({ ok: false, reason: "has_customer_bookings" });
  });
});
