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

/** The store apps built from one codebase: HandyFix (customers), HandyFix Pro (providers), or both (dev/web preview). */
export const APP_VARIANTS = ["customer", "provider", "both"] as const;
export type AppVariant = (typeof APP_VARIANTS)[number];

export function parseAppVariant(value: string | null | undefined): AppVariant {
  return (APP_VARIANTS as readonly string[]).includes(value ?? "") ? (value as AppVariant) : "both";
}

/** Whether an account with this role may use this build. A pro opening the customer app is told to use the Pro app. */
export const variantAllowsRole = (variant: AppVariant, role: AppRole): boolean => variant === "both" || variant === role;

/** Roles the role-pick screen offers in this build. */
export const rolesForVariant = (variant: AppVariant): AppRole[] => (variant === "both" ? [...APP_ROLES] : [variant]);
