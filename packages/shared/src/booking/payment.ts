/**
 * Paying for a booking in the app through Razorpay (owner decision 2026-10-30). The customer may pay online OR pay the
 * pro directly by cash/UPI; the customer platform fee stays ₹0. Only the server ever marks a booking paid (Section 2
 * webhook); the app reads `bookings.payment_status`.
 *
 * The SQL twin of `onlinePaymentBlock` is `booking_payable_paise` in proposal 20261122000000 (booking-payment.test.ts
 * keeps them in step).
 */
export const PAYMENT_STATES = ["unpaid", "pending", "paid", "refunded", "partially_refunded"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/** Anything unknown or missing counts as unpaid (the column defaults to 'unpaid'). */
export function paymentState(value: unknown): PaymentState {
  return (PAYMENT_STATES as readonly unknown[]).includes(value) ? (value as PaymentState) : "unpaid";
}

export type PayableBooking = {
  status: string;
  payment_status?: string | null;
  /** Locked price + approved extras (parts included): the database keeps it current (decide_booking_extra). */
  total_amount: number | string | null;
};

/**
 * The amount to pay in paise, from booking data only: the customer total (locked service bill + approved extras,
 * parts included; customer platform fee is ₹0). Null when there is nothing valid to pay.
 */
export function payableAmountPaise(booking: Pick<PayableBooking, "total_amount">): number | null {
  const rupees = typeof booking.total_amount === "string" ? Number(booking.total_amount) : booking.total_amount;
  if (typeof rupees !== "number" || !Number.isFinite(rupees) || rupees <= 0) return null;
  return Math.round(rupees * 100);
}

export type OnlinePaymentBlock = "not_finished" | "cancelled" | "already_paid" | "payment_pending" | "refunded" | "extra_waiting" | "no_amount";

/**
 * Why a booking cannot be paid online right now, or null when it can. Owner decision: the button appears once the job
 * is completed (the bill is final; completion is blocked while an extra waits for approval) and stays until paid.
 */
export function onlinePaymentBlock(booking: PayableBooking, pendingExtras = 0): OnlinePaymentBlock | null {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status !== "completed") return "not_finished";
  const state = paymentState(booking.payment_status);
  if (state === "paid") return "already_paid";
  if (state === "pending") return "payment_pending";
  if (state === "refunded" || state === "partially_refunded") return "refunded";
  if (pendingExtras > 0) return "extra_waiting";
  if (payableAmountPaise(booking) === null) return "no_amount";
  return null;
}

export const canPayOnline = (booking: PayableBooking, pendingExtras = 0): boolean => onlinePaymentBlock(booking, pendingExtras) === null;

/** Short label for the booking screen. */
export function paymentStateLabel(state: PaymentState): string {
  return {
    unpaid: "Not paid yet",
    pending: "Payment being confirmed",
    paid: "Paid",
    refunded: "Refunded",
    partially_refunded: "Partly refunded",
  }[state];
}
