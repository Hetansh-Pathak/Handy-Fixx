/**
 * Deleting an account is a store requirement (Google Play and Apple both ask for an in-app way). The deletion itself
 * runs on the server (`delete-account`, see supabase/proposals); these are the rules the screen shows first.
 */

export const DELETE_CONFIRM_WORD = "DELETE";

export const isDeleteConfirmed = (text: string): boolean => text.trim().toUpperCase() === DELETE_CONFIRM_WORD;

export function deletionBlockers(input: {
  role: "customer" | "provider";
  activeBookings: number;
  walletBalance?: number;
  walletDue?: number;
}): string[] {
  const out: string[] = [];
  if (input.activeBookings > 0) {
    const n = input.activeBookings;
    out.push(`You have ${n} ${n === 1 ? "booking" : "bookings"} in progress. Finish or cancel ${n === 1 ? "it" : "them"} first.`);
  }
  if (input.role === "provider") {
    if ((input.walletDue ?? 0) > 0) out.push("You have HandyFix fees due. Top up your wallet to clear them first.");
    if ((input.walletBalance ?? 0) > 0) out.push("You still have money in your wallet. Withdraw it first, because it cannot be paid out after deletion.");
  }
  return out;
}

/** A reason the person can read. Technical text from the network or the server is replaced. */
export function deletionErrorMessage(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  const readable = text && text.length < 160 && !/edge function|fetch|http|relay|non-2xx|jwt|supabase/i.test(text);
  return readable ? text : "We could not delete your account from the app right now. Please email our support team from Help & support and we will do it within a few days.";
}
