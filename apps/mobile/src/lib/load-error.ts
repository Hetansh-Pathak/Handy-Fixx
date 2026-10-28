/**
 * A readable reason for a failed load, so "services disappeared" is never a silent empty screen.
 * Missing Supabase settings (the usual cause after a build or folder change) get their own hint.
 */
export function loadErrorMessage(what: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : "";
  if (/not configured|must start with https/i.test(reason)) {
    return `Could not load ${what}: the app is not connected to Supabase. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (run "npm run env:fix"), then restart with --clear.`;
  }
  if (/network request failed|failed to fetch|timeout/i.test(reason)) {
    return `Could not load ${what}: no connection. Check your internet and try again.`;
  }
  return reason ? `Could not load ${what}: ${reason}` : `Could not load ${what}.`;
}
