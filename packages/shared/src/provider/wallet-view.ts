import { formatInr } from "../money/money";
import { launchStatus, type LaunchStatus } from "../money/launch";
import type { AcceptCheck, WalletState } from "../money/wallet";

/** The shape of the `get_wallet_summary()` reply that matters here. `balance` is the signed ledger sum. */
export type WalletSummary = { balance: number; dues: number; available: number };

/**
 * The live ledger is one signed number: money you have is `available`, money you owe is `dues`. That is the
 * same {balance, due} pair the fee rules use (a top-up clears dues first), so no conversion is needed.
 */
export function walletStateFromSummary(s: Partial<WalletSummary> | null | undefined): WalletState {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  return { balance: Math.max(0, n(s?.available)), due: Math.max(0, n(s?.dues)) };
}

/**
 * The fee-free launch starts when the pro is approved (`kyc_reviewed_at`) and counts jobs completed so far
 * (`total_jobs`). Both columns already exist.
 */
export function providerLaunchStatus(
  input: { kycReviewedAt: string | null | undefined; totalJobs: number | null | undefined },
  now: Date,
): LaunchStatus {
  const started = input.kycReviewedAt ? new Date(input.kycReviewedAt) : null;
  return launchStatus(
    { launchStartedAt: started && Number.isFinite(started.getTime()) ? started : null, completedJobs: input.totalJobs ?? 0, now },
  );
}

/** Text for the blocked Accept button. */
export function acceptBlockMessage(check: Extract<AcceptCheck, { ok: false }>): string {
  return check.reason === "due_outstanding"
    ? `You have dues to clear. Top up ${formatInr(check.suggestedTopUp)} to accept new jobs.`
    : `Wallet below the fee. Top up ${formatInr(check.suggestedTopUp)} to accept.`;
}

/** "₹15 waived · 2 months left" style line for the launch strip. */
export function launchLine(status: LaunchStatus): string {
  if (!status.active) return "";
  const months = Math.max(1, Math.round(status.daysLeft / 30));
  return `Fee-free launch: ${status.jobsLeft} job${status.jobsLeft === 1 ? "" : "s"} or ${months} month${months === 1 ? "" : "s"} left`;
}
