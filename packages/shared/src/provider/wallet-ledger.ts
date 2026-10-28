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
};

const LEDGER_LABEL: Record<string, string> = {
  online_credit: "Online payment received",
  cash_fee: "HandyFix fee",
  topup: "Wallet top-up",
  payout: "Withdrawal",
  payout_reversal: "Withdrawal returned",
  refund_reversal: "Refund adjustment",
  adjustment: "Adjustment",
};

export type LedgerLine = { id: string; label: string; amount: number; credit: boolean; amountText: string; note: string | null; createdAt: string };

/** One row of the wallet history, signed: money in is green (+), money out is red (-). */
export function describeLedgerEntry(entry: LedgerEntry): LedgerLine {
  const amount = Number(entry.amount) || 0;
  const credit = amount > 0;
  return {
    id: entry.id,
    label: LEDGER_LABEL[entry.type] ?? "Wallet entry",
    amount,
    credit,
    amountText: `${credit ? "+" : "-"}${formatInr(Math.abs(amount))}`,
    note: entry.note?.trim() ? entry.note.trim() : null,
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

/** Earnings from completed jobs: what the customers paid the pro (service bill), not the wallet. */
export function earningsSummary(
  bookings: { status: string; provider_amount: number | string | null; created_at?: string | null; booking_date?: string | null }[],
  now: Date,
): { jobs: number; total: number; monthJobs: number; monthTotal: number; todayTotal: number } {
  const month = now.toISOString().slice(0, 7);
  const today = now.toISOString().slice(0, 10);
  const s = { jobs: 0, total: 0, monthJobs: 0, monthTotal: 0, todayTotal: 0 };
  for (const b of bookings) {
    if (b.status !== "completed") continue;
    const amount = Number(b.provider_amount) || 0;
    const day = b.booking_date ?? b.created_at?.slice(0, 10) ?? "";
    s.jobs += 1;
    s.total += amount;
    if (day.startsWith(month)) { s.monthJobs += 1; s.monthTotal += amount; }
    if (day === today) s.todayTotal += amount;
  }
  return s;
}

