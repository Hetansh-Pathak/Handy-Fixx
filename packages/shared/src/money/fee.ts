import type { Rupees } from "./money";

/**
 * Fee charged to the PROVIDER on a completed job (owner decision 2026-10-29, replaces the ₹15/₹30/₹50 slabs):
 * 3% of the service bill, rounded to the nearest rupee, never below ₹5 or above ₹50.
 * The SQL twin is `fee_for_service_bill` in proposal 20261114000000 (fee-sql.test.ts keeps them equal).
 */
export const FEE_RATE = 0.03;
export const FEE_MIN: Rupees = 5;
export const FEE_MAX: Rupees = 50;
export const FEE_RULE_LABEL = "3% per job, min ₹5, max ₹50";

/** Customers never pay a platform fee. */
export const CUSTOMER_PLATFORM_FEE: Rupees = 0;

/**
 * Fee for a final SERVICE bill (rate + approved service extras). Parts and materials must NOT be
 * included in `serviceBill`. Non-positive or invalid bills cost ₹0.
 * Worked in whole paise so a bill like ₹250 (fee ₹7.50) rounds up to ₹8 exactly like Postgres `round()`,
 * instead of drifting on binary floating point.
 */
export function feeForServiceBill(serviceBill: Rupees): Rupees {
  if (!Number.isFinite(serviceBill) || serviceBill <= 0) return 0;
  const paise = Math.round(serviceBill * 100);
  const percent = Math.round(FEE_RATE * 100); // 3, an exact integer
  const fee = Math.round((paise * percent) / 10000);
  return Math.min(FEE_MAX, Math.max(FEE_MIN, fee));
}
