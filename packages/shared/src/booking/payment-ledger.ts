import { feeForServiceBill } from "../money/fee";
import { roundMoney, type Rupees } from "../money/money";

/**
 * Payments Section 2: what a confirmed online booking payment (and a refund of it) does to the pro's wallet.
 * The SQL twins are record_booking_payment / record_booking_refund in proposal 20261123000000; the database is the
 * authority, these rules explain and test the numbers (payment-ledger.test.ts keeps them in step).
 */

/**
 * How long a pro's online earning stays on hold after the job is completed before it can be withdrawn: the longest
 * dispute window (48 h for repair quality). Default of wallet_settings.earning_hold_hours (owner decision 2026-10-30).
 */
export const EARNING_HOLD_HOURS = 48;

export type BookingPaymentInput = {
  /** What Razorpay captured, in paise (always equals the order amount; a mismatch is never credited). */
  amountPaidPaise: number;
  /** bookings.provider_amount: locked price + approved extras, parts included. */
  providerAmount: Rupees;
  /** bookings.parts_amount: never part of the fee base. */
  partsAmount: Rupees;
  /** Launch period: the fee is waived (₹0). */
  launchActive: boolean;
  /** A booking_fees row already exists: completion already charged (or waived) the fee, so the payment must not. */
  feeAlreadySettled: boolean;
  /** Fee still held in the wallet for this booking (proposal 20261114); the payment releases it. */
  heldFee?: Rupees;
};

export type BookingPaymentLedger = {
  /** Credit to the pro: everything the customer paid (service bill, approved extras, parts). On hold at first. */
  earning: Rupees;
  /** Fee taken from this payment (0 when already settled at completion or waived). */
  fee: Rupees;
  /** The fee the job would cost, for display ("₹28 waived"). */
  feeForJob: Rupees;
  feeWaived: boolean;
  /** Hold released back to the pro's spendable balance. */
  releaseHold: Rupees;
  /** earning - fee: what this payment adds to the wallet. */
  net: Rupees;
};

export function bookingPaymentLedger(input: BookingPaymentInput): BookingPaymentLedger {
  const earning = roundMoney(Math.max(0, input.amountPaidPaise) / 100);
  const serviceBill = Math.max(0, input.providerAmount - input.partsAmount);
  const feeForJob = feeForServiceBill(serviceBill);
  if (input.feeAlreadySettled) {
    return { earning, fee: 0, feeForJob, feeWaived: false, releaseHold: 0, net: earning };
  }
  const fee = input.launchActive ? 0 : feeForJob;
  return {
    earning,
    fee,
    feeForJob,
    feeWaived: input.launchActive && feeForJob > 0,
    releaseHold: roundMoney(Math.max(0, input.heldFee ?? 0)),
    net: roundMoney(earning - fee),
  };
}

export type BookingRefundInput = {
  paidPaise: number;
  /** Already refunded before this refund, in paise. */
  refundedBeforePaise: number;
  refundPaise: number;
  /** The earning credited for this payment (0 when the payment was not credited, e.g. the booking was already paid). */
  earningCredited: Rupees;
  /** booking_fees.charged and booking_fees.refunded (a dispute decision may have returned the fee already). */
  feeCharged: Rupees;
  feeReturnedBefore: Rupees;
};

export type BookingRefundReversal = {
  /** Paise of this refund that count (a refund cannot exceed what is left of the payment). */
  appliedPaise: number;
  fraction: number;
  earningReversed: Rupees;
  /** The fee goes back to the pro pro-rata (a refunded job costs ₹0), never more than is left to return. */
  feeReturned: Rupees;
  /** Taken from the pro's wallet: earning share minus fee share. May leave a negative balance; never blocks a refund. */
  net: Rupees;
  fullyRefunded: boolean;
};

export function bookingRefundReversal(input: BookingRefundInput): BookingRefundReversal {
  const left = Math.max(0, input.paidPaise - input.refundedBeforePaise);
  const applied = Math.min(Math.max(0, input.refundPaise), left);
  if (input.paidPaise <= 0 || applied === 0) {
    return { appliedPaise: 0, fraction: 0, earningReversed: 0, feeReturned: 0, net: 0, fullyRefunded: left === 0 && input.paidPaise > 0 };
  }
  const fraction = applied / input.paidPaise;
  const earningReversed = roundMoney(input.earningCredited * fraction);
  const feeLeft = Math.max(0, input.feeCharged - input.feeReturnedBefore);
  const feeReturned = input.earningCredited > 0 ? Math.min(roundMoney(input.feeCharged * fraction), roundMoney(feeLeft)) : 0;
  return {
    appliedPaise: applied,
    fraction,
    earningReversed,
    feeReturned,
    net: roundMoney(earningReversed - feeReturned),
    fullyRefunded: input.refundedBeforePaise + applied >= input.paidPaise,
  };
}

/** A ledger row as the app reads it, for the "on hold" total. */
export type HoldLedgerRow = { type: string; amount: number | string; available_at?: string | null; razorpay_payment_id?: string | null };

/**
 * Money from online booking payments that is still on hold: each credit whose available_at is in the future, minus
 * any refund reversal of the same payment. Mirrors wallet_on_hold() in proposal 20261123000000.
 */
export function onHoldTotal(rows: readonly HoldLedgerRow[], now: Date): Rupees {
  let total = 0;
  for (const c of rows) {
    if (c.type !== "online_credit" || !c.available_at || new Date(c.available_at).getTime() <= now.getTime()) continue;
    const reversed = rows
      .filter((r) => r.type === "refund_reversal" && r.razorpay_payment_id && r.razorpay_payment_id === c.razorpay_payment_id)
      .reduce((s, r) => s + Number(r.amount), 0);
    total += Math.max(0, Number(c.amount) + reversed);
  }
  return roundMoney(total);
}
