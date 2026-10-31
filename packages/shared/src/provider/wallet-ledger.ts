import { brandServerText, PLATFORM_FEE_LABEL } from "../brand";
import { formatInr } from "../money/money";

/** Ledger entry types in `wallet_transactions` (see the wallet ledger migration). */
export type LedgerType = "online_credit" | "cash_fee" | "topup" | "payout" | "payout_reversal" | "refund_reversal" | "adjustment";

export type LedgerEntry = {
  id: string;
  type: LedgerType | string;
  amount: number | string;
  note?: string | null;
  booking_id?: string | null;
  created_at: string;
  /** Online booking earnings (Payments Section 2): withdrawable from this time; null/absent = available now. */
  available_at?: string | null;
  razorpay_payment_id?: string | null;
};

const LEDGER_LABEL: Record<string, string> = {
  online_credit: "Paid online",
  cash_fee: PLATFORM_FEE_LABEL,
  topup: "Wallet top-up",
  payout: "Withdrawal",
  payout_reversal: "Withdrawal returned",
  refund_reversal: "Refund adjustment",
  adjustment: "Adjustment",
};

export type LedgerLine = {
  id: string; label: string; amount: number; credit: boolean; amountText: string; note: string | null; createdAt: string;
  /** Set while an online earning is still in the dispute window: shown as "On hold until …". */
  onHoldUntil: string | null;
};

/** One row of the wallet history, signed: money in is green (+), money out is red (-). */
export function describeLedgerEntry(entry: LedgerEntry, now: Date = new Date()): LedgerLine {
  const amount = Number(entry.amount) || 0;
  const credit = amount > 0;
  const until = entry.available_at ? new Date(entry.available_at) : null;
  return {
    onHoldUntil: credit && until && Number.isFinite(until.getTime()) && until.getTime() > now.getTime() ? entry.available_at ?? null : null,
    id: entry.id,
    label: LEDGER_LABEL[entry.type] ?? "Wallet entry",
    amount,
    credit,
    amountText: `${credit ? "+" : "-"}${formatInr(Math.abs(amount))}`,
    // notes written by the database before the rename still say HandyFix
    note: entry.note?.trim() ? brandServerText(entry.note.trim()) : null,
    createdAt: entry.created_at,
  };
}

/** Messages for the `request_payout` reply (`{ ok: false, reason }`). */
export function payoutErrorMessage(reason: string | undefined, minPayout?: number): string {
  switch (reason) {
    case "invalid_amount": return "Enter a valid amount.";
    case "not_approved": return "Withdrawals open once your identity check is approved.";
    case "no_payout_details": return "Add your UPI id or bank account first.";
    case "below_minimum": return `The minimum withdrawal is ${formatInr(minPayout ?? 0)}.`;
    case "insufficient_balance": return "That is more than your wallet balance.";
    default: return "Could not request the withdrawal. Try again.";
  }
}

export type PayoutRequestResult = { ok: true; amount: number } | { ok: false; message: string };

export function interpretPayout(data: unknown): PayoutRequestResult {
  const d = (data ?? {}) as { ok?: boolean; reason?: string; amount?: number | string; min_payout?: number | string };
  if (d.ok === true) return { ok: true, amount: Number(d.amount) || 0 };
  return { ok: false, message: payoutErrorMessage(d.reason, d.min_payout === undefined ? undefined : Number(d.min_payout)) };
}

/** India is UTC+5:30 all year (no daylight saving). */
const IST_OFFSET_MS = 330 * 60_000;

/** "2026-10-28T20:45:04Z" → "2026-10-29": the calendar day in India. Null for a missing or bad value. */
export function indiaDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const ms = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isFinite(ms) ? new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10) : null;
}

/**
 * Earnings from completed jobs: what the customers paid the pro (service bill), not the wallet.
 * A job counts on the India-time day it was COMPLETED (booked for tomorrow but finished at 2 AM today is today's money);
 * rows without `completed_at` fall back to the booked date, then creation. "Today" and "this month" are India time too:
 * using UTC put everything finished between midnight and 5:30 AM on the wrong day.
 */
export function earningsSummary(
  bookings: { status: string; provider_amount: number | string | null; created_at?: string | null; booking_date?: string | null; completed_at?: string | null }[],
  now: Date,
): { jobs: number; total: number; monthJobs: number; monthTotal: number; todayTotal: number } {
  const today = indiaDay(now) ?? "";
  const month = today.slice(0, 7);
  const s = { jobs: 0, total: 0, monthJobs: 0, monthTotal: 0, todayTotal: 0 };
  for (const b of bookings) {
    if (b.status !== "completed") continue;
    const amount = Number(b.provider_amount) || 0;
    const day = indiaDay(b.completed_at) ?? b.booking_date ?? indiaDay(b.created_at) ?? "";
    s.jobs += 1;
    s.total += amount;
    if (day.startsWith(month)) { s.monthJobs += 1; s.monthTotal += amount; }
    if (day === today) s.todayTotal += amount;
  }
  return s;
}

