import { bookingStartsAt } from "../booking/schedule";
import { feeForServiceBill } from "../money/fee";
import { roundMoney, type Rupees } from "../money/money";

type DateLike = string | Date | null | undefined;
const toMs = (v: DateLike) => {
  if (!v) return null;
  const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Whether a booking is still a request the pro can answer: pending and its booked time has not started yet.
 * There is no accept countdown (owner decision): the pro reviews the details and decides when ready.
 */
export function isRequestOpen(input: { status: string; bookingDate?: string | null; bookingTime?: string | null }, now: Date): boolean {
  if (input.status !== "pending") return false;
  const startsAt = bookingStartsAt(input.bookingDate, input.bookingTime);
  return !startsAt || now.getTime() < startsAt.getTime();
}

type RequestRow = { id: string; status: string; created_at: DateLike; booking_date?: string | null; booking_time?: string | null };

/** Open requests, oldest first (first come, first served). */
export function openRequests<T extends RequestRow>(rows: readonly T[], now: Date): T[] {
  return rows
    .filter((r) => isRequestOpen({ status: r.status, bookingDate: r.booking_date, bookingTime: r.booking_time }, now))
    .sort((a, b) => (toMs(a.created_at) ?? 0) - (toMs(b.created_at) ?? 0));
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
