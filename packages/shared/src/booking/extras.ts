import { computeBill, type Bill, type ExtraWorkItem, type ExtraWorkKind } from "../money/bill";
import type { BookingStatus } from "./status";

/** A `booking_extras` row as the database stores it. */
export type ExtraRow = {
  id: string;
  title: string;
  kind: "labour" | "parts";
  amount: number | string;
  photo_path: string | null;
  status: "pending" | "approved" | "declined" | "withdrawn";
  created_at: string;
};

/** The database says labour/parts; the bill rules say service/part. Withdrawn items drop out. */
export function extraItemsFromRows(rows: readonly ExtraRow[]): ExtraWorkItem[] {
  return rows
    .filter((r) => r.status !== "withdrawn")
    .map((r) => ({
      id: r.id,
      description: r.title,
      amount: Number(r.amount),
      kind: (r.kind === "parts" ? "part" : "service") as ExtraWorkKind,
      status: r.status as ExtraWorkItem["status"],
      billPhotoPath: r.photo_path,
    }));
}

export const dbExtraKind = (kind: ExtraWorkKind): ExtraRow["kind"] => (kind === "part" ? "parts" : "labour");

/**
 * The bill as the database keeps it: `provider_amount` already includes approved extras, so the locked rate
 * is provider_amount minus approved extras. Parts never count toward the fee slab.
 */
export function billFromBooking(booking: { provider_amount: number | string | null }, rows: readonly ExtraRow[]): Bill {
  const items = extraItemsFromRows(rows);
  const approved = items.filter((i) => i.status === "approved").reduce((s, i) => s + i.amount, 0);
  const rate = Math.max(0, Number(booking.provider_amount ?? 0) - approved);
  return computeBill({ rate, extras: items });
}

/** PDF p.7: the pro adds extra work while the job is in progress. */
export const canAddExtraWork = (status: BookingStatus): boolean => status === "in_progress";

/** PDF p.5: the customer answers extras on the way / in progress (the database allows the same window). */
export const canAnswerExtraWork = (status: BookingStatus): boolean =>
  status === "on_the_way" || status === "arrived" || status === "in_progress";

export const MAX_PENDING_EXTRAS = 5;

const EXTRA_REASON_MESSAGE: Record<string, string> = {
  unauthorized: "You cannot change extra work on this booking.",
  invalid_status: "Extra work can only be added or answered while the job is underway.",
  invalid_kind: "Pick labour or parts.",
  invalid_amount: "Enter an amount between ₹1 and ₹1,00,000.",
  invalid_title: "Describe the extra work.",
  photo_required: "Attach a photo of the bill for parts.",
  too_many_pending: `At most ${MAX_PENDING_EXTRAS} items can wait for the customer at once.`,
  already_decided: "This item was already answered.",
  not_found: "This item was not found.",
};

/** Turns `{ ok: false, reason }` from the extra-work functions into a sentence. */
export const extraWorkErrorMessage = (reason: string | null | undefined): string =>
  (reason && EXTRA_REASON_MESSAGE[reason]) || "Something went wrong. Try again.";
