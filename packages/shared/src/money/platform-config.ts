import { CUSTOMER_PLATFORM_FEE, FEE_MAX, FEE_MIN, FEE_RATE, FEE_RULE_LABEL, feeForServiceBill } from "./fee";
import { LAUNCH_PERIOD } from "./launch";
import { roundMoney, type Rupees } from "./money";
import { RECHARGE_PACK_AMOUNTS, TYPICAL_BILL } from "./wallet";

/**
 * One place that lists every number of the pro-fee model (owner decisions 2026-10-29). It is BUILT from the
 * constants in fee.ts, launch.ts and wallet.ts, so nothing is typed twice. Screens and the admin page read
 * this object; to change the model later, change those constants (and the SQL twins named in fee-sql.test.ts).
 */
export const PLATFORM_RULES = Object.freeze({
  /** What the customer pays HandyFix on top of the price shown. */
  customerFee: CUSTOMER_PLATFORM_FEE,
  /** Fee on a completed job, charged to the pro's wallet. */
  fee: Object.freeze({ rate: FEE_RATE, min: FEE_MIN, max: FEE_MAX, label: FEE_RULE_LABEL, partsExcluded: true }),
  /** Fee-free start for a new pro: ends at whichever limit is reached first. */
  launch: Object.freeze({ jobs: LAUNCH_PERIOD.jobs, months: LAUNCH_PERIOD.months }),
  /** Recharge packs a pro can buy; the fee is held when a job is accepted. */
  wallet: Object.freeze({ packs: RECHARGE_PACK_AMOUNTS, typicalBill: TYPICAL_BILL, holdsFeeOnAccept: true, allowsDues: false }),
  /** Costs nothing: joining, going online, declining, missing a request, cancelled jobs. */
  freeActions: Object.freeze(["Joining", "Going online", "Declining a request", "Missing a request", "A cancelled job"]),
});

export type FeePreview = {
  serviceBill: Rupees;
  parts: Rupees;
  /** What the customer pays the pro (service bill + parts). */
  customerPays: Rupees;
  /** The fee for this bill by the rule (before any launch waiver). */
  ruleFee: Rupees;
  /** What actually leaves the wallet. */
  charged: Rupees;
  /** Fee not charged because the pro is in the launch period. */
  waived: Rupees;
  /** What the pro keeps after the fee. */
  proNets: Rupees;
};

/** Worked example for one job: used by the admin "Fees & rules" page and any "you earn" line. */
export function feePreview(input: { serviceBill: Rupees; parts?: Rupees; launchActive?: boolean }): FeePreview {
  const serviceBill = Number.isFinite(input.serviceBill) && input.serviceBill > 0 ? roundMoney(input.serviceBill) : 0;
  const parts = Number.isFinite(input.parts) && (input.parts ?? 0) > 0 ? roundMoney(input.parts ?? 0) : 0;
  const ruleFee = feeForServiceBill(serviceBill);
  const waived = input.launchActive ? ruleFee : 0;
  const charged = roundMoney(ruleFee - waived);
  const customerPays = roundMoney(serviceBill + parts);
  return { serviceBill, parts, customerPays, ruleFee, charged, waived, proNets: roundMoney(customerPays - charged) };
}
