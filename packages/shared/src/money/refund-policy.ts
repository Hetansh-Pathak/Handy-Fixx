import { roundMoney, type Rupees } from "./money";

/**
 * DRAFT refund and cancellation policy for a future in-app customer payment (owner, 2026-10-29: "add the refund rule
 * at what you think is best, not too much determined"). It is NOT enforced anywhere yet: today customers pay the pro
 * directly by UPI or cash, so HandyFix moves no customer money. When in-app payment exists, this is the single place
 * that decides how much goes back; change the constants or rules here, in one place, and the tests show what moved.
 *
 * Principles (PDF p.11: "limits, not fees"):
 *  - A customer is never charged a cancellation fee. Repeat late cancels are handled by the 3-in-30-days pause.
 *  - Anything that is the pro's fault (declined, missed, no-show) is refunded in full, automatically.
 *  - Once the pro has started the trip the customer has no cancel button; money moves only through a dispute decision.
 *  - A check-up visit fee is always charged once the pro has arrived (owner decision), unless it was the pro's fault.
 *  - HandyFix absorbs the payment gateway cost (owner decision), so a refund returns the whole amount.
 */
export const REFUND_POLICY = Object.freeze({
  status: "draft: not enforced while customers pay the pro directly",
  customerCancellationFee: 0 as Rupees,
  /** Refund initiated within this many hours (the bank then takes its own few working days). */
  initiateWithinHours: 24,
  /** A refund after the pro was already paid out is taken back from the pro's next payout or wallet. */
  recoverFromProAfterPayout: true,
});

export type RefundEvent =
  | { kind: "customer_cancelled"; status: "pending" | "confirmed"; late: boolean }
  | { kind: "pro_declined" }
  | { kind: "request_missed" } // booked time passed with no answer
  | { kind: "pro_no_show" } // admin cancelled for "Provider unavailable" / no-show
  | { kind: "dispute"; outcome: "dismissed" | "redo" | "partial_refund" | "provider_penalty" | "safety"; adminAmount?: Rupees }
  | { kind: "customer_cancelled_after_trip_started" }; // only possible through support / admin

export type RefundContext = {
  /** What the customer paid in the app (service + approved extras + parts). */
  paid: Rupees;
  /** The part that is a check-up visit fee, when the booking was a check-up visit (0 otherwise). */
  visitFee?: Rupees;
  /** The pro has already arrived (status arrived, in progress or completed). */
  proArrived?: boolean;
};

export type RefundDecision = {
  /** Money back to the customer. */
  amount: Rupees;
  /** 0 to 1 of what was paid. */
  fraction: number;
  /** One plain sentence for the customer. */
  reason: string;
  /** True when an admin must decide the amount (nothing is automatic). */
  needsAdmin: boolean;
  /** True when this counts towards the "3 late cancellations in 30 days" pause. */
  countsAsLateCancel: boolean;
  /** True when the pro's platform fee for this job is returned to the pro (nothing was earned). */
  proFeeReturned: boolean;
};

const clampPaid = (n: Rupees | undefined) => (Number.isFinite(n) && (n as number) > 0 ? roundMoney(n as number) : 0);

const make = (paid: Rupees, amount: Rupees, over: Partial<RefundDecision> & { reason: string }): RefundDecision => {
  const a = Math.min(paid, Math.max(0, roundMoney(amount)));
  return { amount: a, fraction: paid > 0 ? roundMoney(a / paid) : 0, needsAdmin: false, countsAsLateCancel: false, proFeeReturned: false, ...over };
};

/** How much of an in-app payment goes back for each event. Pure; never negative, never more than was paid. */
export function refundDecision(event: RefundEvent, ctx: RefundContext): RefundDecision {
  const paid = clampPaid(ctx.paid);
  const visitFee = Math.min(paid, clampPaid(ctx.visitFee));
  const keepVisitFee = ctx.proArrived === true && visitFee > 0;

  switch (event.kind) {
    case "customer_cancelled":
      return make(paid, paid, {
        reason: event.late
          ? "You cancelled close to the start time. You get everything back, and this counts towards the late-cancellation limit."
          : "You cancelled in time. You get everything back.",
        countsAsLateCancel: event.late && event.status === "confirmed",
        proFeeReturned: true,
      });
    case "pro_declined":
      return make(paid, paid, { reason: "The pro could not take your request. You get everything back.", proFeeReturned: true });
    case "request_missed":
      return make(paid, paid, { reason: "No pro answered before the booked time. You get everything back.", proFeeReturned: true });
    case "pro_no_show":
      return make(paid, paid, { reason: "Your pro did not come. You get everything back.", proFeeReturned: true });
    case "customer_cancelled_after_trip_started":
      // No self-service cancel once the trip has started: support decides. Suggested default keeps only a visit fee.
      return make(paid, paid - (keepVisitFee ? visitFee : 0), {
        reason: keepVisitFee ? "The pro had already arrived, so the visit fee is kept. The rest comes back." : "Support reviews this and decides the amount.",
        needsAdmin: true,
      });
    case "dispute": {
      switch (event.outcome) {
        case "dismissed":
          return make(paid, 0, { reason: "After review, the work was fine, so nothing is refunded." });
        case "redo":
          return make(paid, 0, { reason: "The pro returns to redo the work free of charge (warranty visit within 7 days)." });
        case "partial_refund":
          return make(paid, event.adminAmount ?? 0, { reason: "After review, part of the amount is refunded.", needsAdmin: event.adminAmount === undefined });
        case "provider_penalty":
          // The penalty is on the pro (warning, ranking, suspension); the customer's money follows the admin's amount.
          return make(paid, event.adminAmount ?? paid - (keepVisitFee ? visitFee : 0), { reason: "After review, the pro was at fault.", needsAdmin: event.adminAmount === undefined, proFeeReturned: true });
        case "safety":
          return make(paid, paid, { reason: "A safety problem was reported. You get everything back while we look into it.", proFeeReturned: true });
      }
    }
  }
}

/** The policy in plain lines, for Help screens and the draft document. */
export function refundPolicyLines(): string[] {
  return [
    "Cancel while your request is waiting or the pro has accepted: you get everything back. We never charge you to cancel.",
    "If the pro declines, does not answer before the booked time, or does not come: you get everything back.",
    "Once the pro starts the trip, the Cancel button is gone. Tell us through Report a problem and support decides.",
    "A check-up visit fee is kept once the pro has arrived, unless the pro was at fault.",
    "After the job you can report a problem for 24 hours (48 hours for repair quality). We review it and decide: nothing, a free return visit, or a refund of part or all of it.",
    `Refunds are started within ${REFUND_POLICY.initiateWithinHours} hours; your bank then takes a few working days.`,
  ];
}
