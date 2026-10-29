import { formatInr } from "../money/money";
import { launchStatus, type LaunchStatus } from "../money/launch";
import type { AcceptCheck, WalletState } from "../money/wallet";

/**
 * The shape of the `get_wallet_summary()` reply that matters here. `balance` is the signed ledger sum;
 * `held` (proposal 20261114000000) is fees reserved for accepted jobs and is already taken out of `available`.
 */
export type WalletSummary = { balance: number; dues: number; available: number; held?: number };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * The live ledger is one signed number: money you can spend is `available`, money you owe is `dues`. That is
 * the same {balance, due} pair the fee rules use (a recharge clears dues first), so no conversion is needed.
 */
export function walletStateFromSummary(s: Partial<WalletSummary> | null | undefined): WalletState {
  return { balance: Math.max(0, num(s?.available)), due: Math.max(0, num(s?.dues)) };
}

/** Fees reserved for accepted jobs ("₹12 reserved for your current job"); 0 before holds exist. */
export function heldFromSummary(s: Partial<WalletSummary> | null | undefined): number {
  return Math.max(0, num(s?.held));
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

/** Text under the disabled Accept button. */
export function acceptBlockMessage(check: Extract<AcceptCheck, { ok: false }>): string {
  return check.reason === "due_outstanding"
    ? `Recharge ${formatInr(check.suggestedTopUp)} to clear ${formatInr(Math.max(0, check.shortfall - check.fee))} you owe and accept new jobs.`
    : `Recharge ${formatInr(check.suggestedTopUp)} to accept. Your wallet is below the ${formatInr(check.fee)} fee.`;
}

/** "Covers about 8 more jobs" for the wallet headline. */
export function jobsCoveredLine(jobs: number): string {
  if (jobs <= 0) return "Recharge to accept new jobs";
  return `Covers about ${jobs} more ${jobs === 1 ? "job" : "jobs"}`;
}

/** "₹15 waived · 2 months left" style line for the launch strip. */
export function launchLine(status: LaunchStatus): string {
  if (!status.active) return "";
  const months = Math.max(1, Math.round(status.daysLeft / 30));
  return `Fee-free launch: ${status.jobsLeft} job${status.jobsLeft === 1 ? "" : "s"} or ${months} month${months === 1 ? "" : "s"} left`;
}
