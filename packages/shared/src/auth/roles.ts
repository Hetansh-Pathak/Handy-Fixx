export const APP_ROLES = ["customer", "provider"] as const;
export type AppRole = (typeof APP_ROLES)[number];
/** Admin uses the web panel only; it is never picked in the mobile app. */
export type Role = AppRole | "admin";

export const isAppRole = (v: unknown): v is AppRole => (APP_ROLES as readonly unknown[]).includes(v);

/**
 * Real path segments, not route groups: groups add no URL segment, so `(customer)/index` and
 * `(provider)/index` would both be `/` and fight over it.
 */
export const ROLE_HOME_ROUTE: Record<AppRole, "/customer" | "/provider"> = {
  customer: "/customer",
  provider: "/provider",
};

/** One role per account: the role-pick screen runs once, after sign-up. */
export const needsRolePick = (existingRole: AppRole | null | undefined) => !existingRole;

/** Where a SIGNED-IN user lands: their role's home, or the one-time role-pick screen. */
export function homeRouteFor(role: AppRole | null | undefined): "/role-pick" | "/customer" | "/provider" {
  return role ? ROLE_HOME_ROUTE[role] : "/role-pick";
}

/** Background location is requested only after someone picks the provider role. */
export const requiresBackgroundLocation = (role: AppRole) => role === "provider";
