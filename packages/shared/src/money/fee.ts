import type { Rupees } from "./money";

/** Platform fee slabs charged to the PROVIDER on a completed job (HandyFix-complete.pdf, p.3). */
export const FEE_LOW: Rupees = 15;
export const FEE_MID: Rupees = 30;
export const FEE_HIGH: Rupees = 50;
/** Bills below this get FEE_LOW. */
export const SLAB_MID_FROM: Rupees = 500;
/** Bills above this get FEE_HIGH (this value itself is still FEE_MID). */
export const SLAB_HIGH_ABOVE: Rupees = 1500;

/** Customers never pay a platform fee. */
export const CUSTOMER_PLATFORM_FEE: Rupees = 0;

export const FEE_SLAB_TABLE = [
  { label: "Under ₹500", fee: FEE_LOW },
  { label: "₹500 to ₹1,500", fee: FEE_MID },
  { label: "Above ₹1,500", fee: FEE_HIGH },
] as const;

/**
 * Flat fee for a final SERVICE bill (rate + approved service extras). Parts and
 * materials must NOT be included in `serviceBill`. Non-positive or invalid bills cost ₹0.
 */
export function feeForServiceBill(serviceBill: Rupees): Rupees {
  if (!Number.isFinite(serviceBill) || serviceBill <= 0) return 0;
  if (serviceBill < SLAB_MID_FROM) return FEE_LOW;
  if (serviceBill <= SLAB_HIGH_ABOVE) return FEE_MID;
  return FEE_HIGH;
}
