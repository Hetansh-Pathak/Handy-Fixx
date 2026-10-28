/**
 * One place that turns a Supabase / Postgres error into a sentence a customer or pro can act on. Screens must never
 * show raw database text ("violates row-level security policy", "column does not exist").
 * Only messages the database itself wrote for people (RAISE EXCEPTION with P0001 or 22023) are shown as written.
 */
export function friendlyDbError(error: { code?: string | null; message?: string | null } | null | undefined): string {
  const message = (error?.message ?? "").trim();
  const code = error?.code ?? "";
  if ((code === "P0001" || code === "22023") && message) return message;
  if (/network request failed|failed to fetch|fetch failed|timed out|timeout|offline/i.test(message)) {
    return "No internet connection. Check your internet and try again.";
  }
  if (code === "PGRST301" || /jwt expired|invalid jwt/i.test(message)) return "Your session ended. Please sign in again.";
  if (/invalid status change .*-> ?arrived/i.test(message)) {
    return "The \"I've arrived\" step is not switched on in the HandyFix database yet. Ask the HandyFix team to apply the arrived-step update.";
  }
  if (/invalid status change/i.test(message)) return "That step is not available right now. Refresh the job and try again.";
  if (code === "42501" || /row-level security|permission denied/i.test(message)) return "You are not allowed to do that right now.";
  if (code === "23505") return "That already exists.";
  if (code === "23503") return "Something this depends on no longer exists. Please refresh and try again.";
  return "Something went wrong. Please try again.";
}
