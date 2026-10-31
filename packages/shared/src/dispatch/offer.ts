import { formatInr, type Rupees } from "../money/money";
import type { OfferAccess } from "./eligibility";

/**
 * One offer of one booking to one pro (`booking_offers.status`). One row per booking and pro, so a pro is never
 * offered the same job twice when the rings widen.
 */
export const OFFER_STATUSES = ["offered", "accepted", "taken", "expired", "withdrawn"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export type OfferEvent =
  /** This pro's accept won the race. */
  | "accept_won"
  /** Another pro accepted first. */
  | "other_won"
  /** The search ended with nobody (time up). */
  | "search_ended"
  /** The customer cancelled the search. */
  | "customer_cancelled";

const NEXT: Record<OfferEvent, OfferStatus> = {
  accept_won: "accepted",
  other_won: "taken",
  search_ended: "expired",
  customer_cancelled: "withdrawn",
};

/** Only an open offer can change, and only once; anything else is refused (null). SQL twin: the `WHERE status = 'offered'` updates. */
export function offerTransition(from: OfferStatus, event: OfferEvent): OfferStatus | null {
  return from === "offered" ? NEXT[event] : null;
}

export const isOfferOpen = (s: OfferStatus): boolean => s === "offered";

export function readOfferStatus(v: unknown): OfferStatus {
  return (OFFER_STATUSES as readonly unknown[]).includes(v) ? (v as OfferStatus) : "expired";
}

/** What the pro's offer card shows (no countdown: an offer stays open until accepted or the search ends). */
export type OfferView =
  | { kind: "accept"; button: string; feeLine: string }
  | { kind: "top_up"; button: string; feeLine: string; topUp: Rupees }
  | { kind: "accepted" | "taken" | "expired" | "withdrawn"; message: string };

export function offerView(status: OfferStatus, access: OfferAccess): OfferView {
  switch (status) {
    case "accepted":
      return { kind: "accepted", message: "Accepted. The job is yours." };
    case "taken":
      return { kind: "taken", message: "Taken by another pro" };
    case "expired":
      return { kind: "expired", message: "Expired" };
    case "withdrawn":
      return { kind: "withdrawn", message: "The customer cancelled this request" };
    case "offered":
      break;
  }
  if (access.canAccept) {
    return { kind: "accept", button: "Accept", feeLine: access.feeWaived ? "HandyFix fee waived (launch period)" : `HandyFix fee ${formatInr(access.fee)}, taken when the job completes` };
  }
  return {
    kind: "top_up",
    button: `Top up ${formatInr(access.topUp)} to accept`,
    feeLine: `HandyFix fee ${formatInr(access.fee)}. Your wallet is too low to accept.`,
    topUp: access.topUp,
  };
}
