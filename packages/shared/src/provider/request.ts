import { REQUEST_TIMEOUT_SECONDS } from "../booking/request-timer";
import { feeForServiceBill } from "../money/fee";
import { roundMoney, type Rupees } from "../money/money";

type DateLike = string | Date | null | undefined;
const toMs = (v: DateLike) => {
  if (!v) return null;
  const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Whether a booking is still an open request for the pro: pending and younger than the 30 s window.
 * A request older than that has already been (or is about to be) offered to other pros.
 */
export function isRequestOpen(
  input: { status: string; createdAt: DateLike },
  now: Date,
  timeoutSeconds = REQUEST_TIMEOUT_SECONDS,
): boolean {
  if (input.status !== "pending") return false;
  const created = toMs(input.createdAt);
  if (created === null) return false;
  const ageSeconds = (now.getTime() - created) / 1000;
  // A device clock a little behind the server makes the age slightly negative: still open.
  return ageSeconds < timeoutSeconds;
}

/** If several requests are open, the oldest first (first come, first served). */
export function pickCurrentRequest<T extends { status: string; created_at: DateLike }>(rows: readonly T[], now: Date): T | null {
  const open = rows.filter((r) => isRequestOpen({ status: r.status, createdAt: r.created_at }, now));
  open.sort((a, b) => (toMs(a.created_at) ?? 0) - (toMs(b.created_at) ?? 0));
  return open[0] ?? null;
}

export type RequestEconomics = {
  /** What the pro earns from the customer. */
  earning: Rupees;
  /** The real slab fee for this job. */
  fee: Rupees;
  /** True during the fee-free launch period: the fee is shown as "waived". */
  feeWaived: boolean;
  /** Earning minus the fee that will actually be charged. */
  youKeep: Rupees;
};

/** What the request alert shows before the pro decides: the earning and the fee (PDF p.7). */
export function requestEconomics(input: { price: Rupees; launchActive: boolean }): RequestEconomics {
  const fee = feeForServiceBill(input.price);
  return {
    earning: input.price,
    fee,
    feeWaived: input.launchActive && fee > 0,
    youKeep: roundMoney(input.price - (input.launchActive ? 0 : fee)),
  };
}
