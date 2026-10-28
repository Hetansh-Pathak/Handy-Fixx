import { CUSTOMER_PLATFORM_FEE } from "./fee";
import { roundMoney, type Rupees } from "./money";

export type ExtraWorkKind = "service" | "part";
export type ExtraWorkStatus = "pending" | "approved" | "declined";

export type ExtraWorkItem = {
  id: string;
  description: string;
  amount: Rupees;
  /** `service` counts toward the fee; `part` (parts/materials) does not. */
  kind: ExtraWorkKind;
  status: ExtraWorkStatus;
  /** Required for parts so the customer can see the bill (no hidden markup). */
  billPhotoPath?: string | null;
};

export type Bill = {
  rate: Rupees;
  /** Approved service extras only. */
  extraServiceTotal: Rupees;
  /** Approved parts/materials only. */
  partsTotal: Rupees;
  /** rate + approved service extras. The fee is worked out from this. */
  serviceBill: Rupees;
  /** Platform fee added to the customer's bill: always ₹0. */
  customerPlatformFee: Rupees;
  /** What the customer pays the pro: serviceBill + parts. */
  customerTotal: Rupees;
  /** Extras still waiting for the customer's tap (not in any total). */
  pendingTotal: Rupees;
};

/** Only approved items change the bill; pending and declined never do. */
export function computeBill(input: { rate: Rupees; extras?: readonly ExtraWorkItem[] }): Bill {
  const extras = input.extras ?? [];
  const sum = (kind: ExtraWorkKind, status: ExtraWorkStatus) =>
    roundMoney(extras.filter((e) => e.kind === kind && e.status === status).reduce((s, e) => s + e.amount, 0));
  const extraServiceTotal = sum("service", "approved");
  const partsTotal = sum("part", "approved");
  const serviceBill = roundMoney(input.rate + extraServiceTotal);
  return {
    rate: input.rate,
    extraServiceTotal,
    partsTotal,
    serviceBill,
    customerPlatformFee: CUSTOMER_PLATFORM_FEE,
    customerTotal: roundMoney(serviceBill + partsTotal),
    pendingTotal: roundMoney(
      extras.filter((e) => e.status === "pending").reduce((s, e) => s + e.amount, 0),
    ),
  };
}

export type NewExtraWorkInput = {
  description: string;
  amount: number;
  kind: ExtraWorkKind;
  billPhotoPath?: string | null;
};

/** Extra work may only be added while the job is in progress. Returns field errors (empty = valid). */
export function validateNewExtraWork(
  input: NewExtraWorkInput,
  bookingStatus: string,
): Partial<Record<"status" | "description" | "amount" | "billPhoto", string>> {
  const errors: Partial<Record<"status" | "description" | "amount" | "billPhoto", string>> = {};
  if (bookingStatus !== "in_progress") errors.status = "Extra work can only be added while the job is in progress.";
  const description = input.description.trim();
  if (description.length < 3) errors.description = "Describe the extra work.";
  else if (description.length > 200) errors.description = "Keep the description under 200 characters.";
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.amount = "Enter an amount above ₹0.";
  if (input.kind === "part" && !input.billPhotoPath) errors.billPhoto = "Attach a photo of the bill for parts.";
  return errors;
}

/** Customer's one-tap answer. Throws if the item was already answered. */
export function respondToExtraWork(item: ExtraWorkItem, decision: "approve" | "decline"): ExtraWorkItem {
  if (item.status !== "pending") throw new Error(`Extra work is already ${item.status}.`);
  return { ...item, status: decision === "approve" ? "approved" : "declined" };
}
