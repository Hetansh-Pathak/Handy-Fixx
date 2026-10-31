import { isAppRole, type AppRole } from "./roles";

/** Key under `auth.users.raw_user_meta_data` where the picked role is remembered. */
export const ROLE_METADATA_KEY = "handyfix_role";

/**
 * The role is a routing convenience, NOT a permission. What a user may actually do is enforced
 * by RLS and the provider's KYC status, never by this value (user metadata is client-editable).
 */
export function readRoleFromMetadata(metadata: unknown): AppRole | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[ROLE_METADATA_KEY];
  return isAppRole(value) ? value : null;
}

export type RoleResolution =
  | { role: AppRole; source: "provider_row" | "metadata" }
  | { role: null; reason: "not_picked" | "incomplete_provider" };

/**
 * One role per account. Authoritative fact first: a `service_providers` row means provider
 * (this also covers every provider account created in the old web app). Otherwise fall back to
 * the role remembered at role-pick. A remembered `provider` with no row means signing up as a
 * pro was interrupted, so the user is sent back to finish it.
 */
export function resolveAppRole(input: { metadataRole: AppRole | null; hasProviderRow: boolean }): RoleResolution {
  if (input.hasProviderRow) return { role: "provider", source: "provider_row" };
  if (input.metadataRole === "customer") return { role: "customer", source: "metadata" };
  if (input.metadataRole === "provider") return { role: null, reason: "incomplete_provider" };
  return { role: null, reason: "not_picked" };
}

export type ProviderEligibility = { ok: true } | { ok: false; reason: "has_customer_bookings" };

/** An account already used as a customer cannot also become a pro (one role per account). */
export function canBecomeProvider(input: { customerBookingCount: number }): ProviderEligibility {
  return input.customerBookingCount > 0 ? { ok: false, reason: "has_customer_bookings" } : { ok: true };
}

export const PROVIDER_BLOCKED_MESSAGE =
  "This account has been used to book services. To work as a apnabanda Pro, sign up with a different email.";
