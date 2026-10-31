import { formatBookingWhen } from "../booking/schedule";
import { formatDistance } from "../geo/distance";
import { roundMoney, type Rupees } from "../money/money";
import { packFor } from "../money/wallet";
import type { OfferAccess } from "./eligibility";
import { readOfferStatus, type OfferStatus } from "./offer";

/** What `get_offer_card` returns: limited fields only (never the address, the customer's name or phone). */
export type OfferCard = {
  bookingId: string;
  status: OfferStatus;
  offeredAt: Date | null;
  approxKm: number | null;
  serviceName: string;
  locality: string | null;
  bookingDate: string | null;
  bookingTime: string | null;
  note: string | null;
  price: Rupees;
  /** The fee the DATABASE will charge (today's slabs or 3%, whichever is live). */
  fee: Rupees;
  launchActive: boolean;
  walletBalance: Rupees;
};

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function readOfferCard(raw: unknown): OfferCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.booking_id !== "string") return null;
  const at = typeof r.offered_at === "string" ? new Date(r.offered_at) : null;
  return {
    bookingId: r.booking_id,
    status: readOfferStatus(r.offer_status),
    offeredAt: at && Number.isFinite(at.getTime()) ? at : null,
    approxKm: r.approx_km == null ? null : num(r.approx_km),
    serviceName: text(r.sub_item_name) ?? text(r.service_name) ?? "Service",
    locality: text(r.locality),
    bookingDate: text(r.booking_date),
    bookingTime: text(r.booking_time),
    note: text(r.note),
    price: num(r.price),
    fee: num(r.fee),
    launchActive: r.launch_active === true,
    walletBalance: num(r.wallet_balance),
  };
}

/**
 * The button on the offer, from the card's own numbers (the database's fee and balance), mirroring the live
 * `enforce_wallet_before_accept`: launch period = always; otherwise the balance must cover the fee and not be negative.
 */
export function offerCardAccess(card: OfferCard): OfferAccess {
  if (card.launchActive) return { canAccept: true, fee: card.fee, feeWaived: true };
  if (card.walletBalance >= card.fee && card.walletBalance >= 0) return { canAccept: true, fee: card.fee, feeWaived: false };
  return { canAccept: false, fee: card.fee, topUp: packFor(roundMoney(card.fee - card.walletBalance)) };
}

/** "Now" when the slot is within the next hour, else the booked slot ("Tue 4 Nov, 10:30 AM"). */
export function offerWhenLine(card: Pick<OfferCard, "bookingDate" | "bookingTime">, now: Date): string {
  if (!card.bookingDate || !card.bookingTime) return "Now";
  const at = new Date(`${card.bookingDate}T${card.bookingTime.slice(0, 8)}`);
  if (Number.isFinite(at.getTime()) && at.getTime() - now.getTime() < 60 * 60_000) return "Now";
  return formatBookingWhen(card.bookingDate, card.bookingTime);
}

/** "about 1.5 km away · Jamnagar, 361001". */
export function offerWhereLine(card: Pick<OfferCard, "approxKm" | "locality">): string {
  const km = card.approxKm == null ? null : `about ${formatDistance(card.approxKm)} away`;
  return [km, card.locality].filter(Boolean).join(" · ") || "Near you";
}

export type AcceptOutcome =
  | { kind: "accepted"; bookingId: string }
  | { kind: "closed"; status: Exclude<OfferStatus, "offered" | "accepted">; message: string }
  | { kind: "top_up"; message: string }
  | { kind: "refused"; message: string };

/** `accept_dispatch_offer`'s answer as the pro sees it. Unknown answers are treated as closed, never as a win. */
export function acceptOutcome(raw: unknown, bookingId: string): AcceptOutcome {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const message = typeof r.message === "string" ? r.message : "";
  switch (r.result) {
    case "accepted":
      return { kind: "accepted", bookingId: typeof r.booking_id === "string" ? r.booking_id : bookingId };
    case "taken":
      return { kind: "closed", status: "taken", message: "Taken by another pro" };
    case "withdrawn":
      return { kind: "closed", status: "withdrawn", message: "The customer cancelled this request" };
    case "top_up":
      return { kind: "top_up", message: message.replace(/\bRs\.?\s?/g, "₹") || "Top up your wallet to accept." };
    case "refused":
      return { kind: "refused", message: message || "You cannot accept this job right now." };
    default:
      return { kind: "closed", status: "expired", message: "Expired" };
  }
}
