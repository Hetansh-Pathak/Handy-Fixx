/**
 * Client side of account deletion (Google Play requires an in-app way to delete an account, and a
 * public web URL that explains it — see pages/DeleteAccount.tsx).
 *
 * The server function is `delete-customer-account`. It identifies the caller from the session JWT,
 * so nothing here can delete anyone else's account.
 */
export const CONFIRM_PHRASE = "DELETE";

export type DeleteErrorCode =
  | "provider_account"
  | "active_booking"
  | "unpaid_booking"
  | "step_failed"
  | "confirm"
  | "unauthorized"
  | "network"
  | "unexpected";

/** True when what the person typed counts as confirmation (case/space-insensitive). */
export const isConfirmed = (input: string) => input.trim().toUpperCase() === CONFIRM_PHRASE;

const MESSAGES: Record<DeleteErrorCode, string> = {
  active_booking:
    "You have a booking that's already confirmed or in progress. Finish or cancel it first, then try again.",
  unpaid_booking:
    "You have a finished job that hasn't been paid for yet. Pay it from My Bookings, then delete your account.",
  provider_account:
    "This login is also used for a provider account, so it can't be deleted from here. Contact support and we'll help.",
  step_failed: "We couldn't finish deleting your data. Nothing was lost — please try again in a minute.",
  confirm: `Type ${CONFIRM_PHRASE} to confirm.`,
  unauthorized: "Your session has expired. Log in again and retry.",
  network: "No connection. Check your internet and try again.",
  unexpected: "Something went wrong. Please try again.",
};

export const deleteErrorMessage = (code: DeleteErrorCode) => MESSAGES[code] ?? MESSAGES.unexpected;

const KNOWN = new Set<string>(Object.keys(MESSAGES));

/**
 * supabase-js wraps a non-2xx Edge Function response in an error whose `context` is the raw
 * Response. The function always answers `{ error, code }`, so read the code from there.
 */
export async function parseDeleteError(err: unknown): Promise<DeleteErrorCode> {
  const e = err as { name?: string; context?: unknown; message?: string } | null;
  if (!e) return "unexpected";
  if (e.name === "FunctionsFetchError") return "network";
  const ctx = e.context as { json?: () => Promise<unknown> } | undefined;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { code?: string } | null;
      if (body?.code && KNOWN.has(body.code)) return body.code as DeleteErrorCode;
    } catch {
      /* body wasn't JSON — fall through */
    }
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  return "unexpected";
}

/** What is removed vs kept — shown in the dialog and on the public page so both always agree. */
export const DELETION_REMOVED = [
  "Your login, profile, saved address and phone number",
  "Your notifications and the chat messages you sent",
  "Photos and voice notes you attached to bookings",
  "Your name, phone, address and location on past bookings",
] as const;

export const DELETION_KEPT = [
  "Past bookings stay for the provider's accounting, with your details removed",
  "Reviews you wrote stay (shown as “Deleted user”) so provider ratings remain accurate",
] as const;
