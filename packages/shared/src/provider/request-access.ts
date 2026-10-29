import { checkCanAccept, type RechargePack, type WalletState } from "../money/wallet";
import { feeForServiceBill } from "../money/fee";
import { formatInr, roundMoney, type Rupees } from "../money/money";
import type { BookingStatus } from "../booking/status";
import { acceptBlockMessage } from "./wallet-view";

/** The most locked requests shown as cards; the rest become a "+N more" counter (owner plan, 2026-10-29). */
export const LOCKED_CARD_CAP = 3;

export type RequestAccess =
  | { state: "open"; fee: Rupees; feeWaived: boolean }
  | {
      state: "locked";
      reason: "insufficient_wallet" | "due_outstanding";
      fee: Rupees;
      /** How much more the wallet needs. */
      shortfall: Rupees;
      /** The recharge pack for the "Recharge ₹X to accept" button. */
      topUp: RechargePack;
      /** One plain sentence for the pro. */
      message: string;
      /** Text for the recharge button. */
      cta: string;
    };

/**
 * Can this pro accept this request right now? A request stays VISIBLE either way (the pro sees what they
 * would earn), but it is locked when the spendable wallet cannot cover the fee that accepting holds.
 * `walletReady = false` (balance not loaded yet) never locks: the database is the real authority and a
 * wrong "locked" flash would only confuse. The launch period skips the check.
 */
export function requestAccess(input: {
  /** The pro's locked rate for the job (service bill at request time; parts are added later). */
  price: Rupees;
  wallet: WalletState;
  launchActive: boolean;
  walletReady?: boolean;
}): RequestAccess {
  const check = checkCanAccept({ wallet: input.wallet, estimatedServiceBill: input.price, launchActive: input.launchActive });
  if (input.walletReady === false || check.ok) {
    return { state: "open", fee: check.fee, feeWaived: check.ok ? check.feeWaived : false };
  }
  return {
    state: "locked",
    reason: check.reason,
    fee: check.fee,
    shortfall: check.shortfall,
    topUp: check.suggestedTopUp,
    message: acceptBlockMessage(check),
    cta: `Recharge ${formatInr(check.suggestedTopUp)} to accept`,
  };
}

export type PartitionedRequests<T> = {
  /** Requests the pro can accept, in the original order. */
  open: T[];
  /** Locked requests to show as cards (at most `cap`), in the original order. */
  locked: T[];
  /** How many more locked requests are not shown as cards ("+N more"). */
  hiddenLocked: number;
  /** All locked requests (shown + hidden). */
  lockedTotal: number;
};

/** Open requests first, then at most `cap` locked cards and a counter for the rest. */
export function partitionByAccess<T>(rows: readonly T[], isLocked: (row: T) => boolean, cap: number = LOCKED_CARD_CAP): PartitionedRequests<T> {
  const open: T[] = [];
  const lockedAll: T[] = [];
  for (const r of rows) (isLocked(r) ? lockedAll : open).push(r);
  const limit = Math.max(0, Math.floor(cap));
  return { open, locked: lockedAll.slice(0, limit), hiddenLocked: Math.max(0, lockedAll.length - limit), lockedTotal: lockedAll.length };
}

/** Street address and exact location are shared only once the pro has accepted (PDF p.4: details after confirmation). */
export const addressVisibleToProvider = (status: BookingStatus): boolean =>
  status === "confirmed" || status === "on_the_way" || status === "arrived" || status === "in_progress" || status === "completed";

/**
 * What the pro may read as "Where" for a job. Before accepting (or if it never got accepted) that is only
 * the city and pincode, so the pro can judge the distance but cannot go around the app.
 */
export function whereForProvider(
  booking: { address?: string | null; city?: string | null; pincode?: string | null },
  status: BookingStatus,
): string {
  const parts = addressVisibleToProvider(status)
    ? [booking.address, booking.city, booking.pincode]
    : [booking.city, booking.pincode];
  const text = parts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
  if (text) return addressVisibleToProvider(status) ? text : `${text} (full address after you accept)`;
  return addressVisibleToProvider(status) ? "Address not shared" : "Full address after you accept";
}

/** Earning line for a locked request card: what the pro would keep if they could accept. */
export function lockedEarningLine(price: Rupees): string {
  const fee = feeForServiceBill(price);
  return `You would earn ${formatInr(price)} · fee ${formatInr(fee)} · you would keep ${formatInr(roundMoney(price - fee))}`;
}
