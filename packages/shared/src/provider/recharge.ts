import type { LedgerEntry } from "./wallet-ledger";

/**
 * Wallet recharge helpers for the Pro app. The wallet is credited ONLY by the server webhook; the app watches the
 * ledger for the new top-up row. See docs/PAYMENTS_SETUP.md.
 */

/**
 * Has the top-up for this recharge reached the ledger? Looks for a `topup` row of exactly this amount that was not
 * there before. Comparing row counts fails once the ledger list is capped (40 rows): the new row pushes an old one out.
 */
export function findNewTopup(beforeIds: ReadonlySet<string>, after: readonly LedgerEntry[], amount: number): LedgerEntry | null {
  return after.find((e) => e.type === "topup" && !beforeIds.has(e.id) && Number(e.amount) === amount) ?? null;
}

export type CheckoutFailure = { status: "cancelled" } | { status: "failed"; message: string };

const NOT_CHARGED = "The payment did not go through. You were not charged.";

/** react-native-razorpay rejects with { code, description }; on Android `description` is often a JSON string. */
function describe(err: unknown): { code: unknown; text: string } {
  const e = (err ?? {}) as { code?: unknown; description?: unknown; error?: { description?: unknown; reason?: unknown } };
  let text = typeof e.description === "string" ? e.description : typeof e.error?.description === "string" ? e.error.description : "";
  let reason = typeof e.error?.reason === "string" ? e.error.reason : "";
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: { description?: unknown; reason?: unknown }; description?: unknown };
      const inner = parsed.error ?? parsed;
      text = typeof inner.description === "string" ? inner.description : "";
      reason = typeof (inner as { reason?: unknown }).reason === "string" ? String((inner as { reason?: unknown }).reason) : reason;
    } catch {
      text = "";
    }
  }
  return { code: e.code, text: text || reason.replace(/_/g, " ") };
}

/**
 * Turns a Razorpay Checkout rejection into what the pro sees. Closing the sheet (code 0 or "cancelled") is not an error.
 * Network trouble (code 1) and invalid options (code 2) get a plain sentence; otherwise Razorpay's own description is
 * shown, never raw JSON.
 */
export function checkoutFailure(err: unknown): CheckoutFailure {
  const { code, text } = describe(err);
  if (code === 0 || code === "0" || /cancel/i.test(text)) return { status: "cancelled" };
  if (code === 1 || code === "1") return { status: "failed", message: "No internet connection. Nothing was charged; try again when you are online." };
  if (code === 2 || code === "2") return { status: "failed", message: "The payment could not start. Nothing was charged; please try again." };
  return { status: "failed", message: text ? `${text.replace(/\.?$/, ".")} Nothing was charged.` : NOT_CHARGED };
}

/** Friendly text when the order cannot even be created (before Razorpay opens). Server messages pass through. */
export function rechargeStartError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (!message) return "Could not start the payment. Please try again.";
  if (/failed to (send|fetch)|network request failed|networkerror|load failed|timeout/i.test(message)) {
    return "No connection. Check your internet and try again. Nothing was charged.";
  }
  if (/non-2xx|edge function returned/i.test(message)) return "Could not start the payment. Please try again in a minute.";
  return message;
}
