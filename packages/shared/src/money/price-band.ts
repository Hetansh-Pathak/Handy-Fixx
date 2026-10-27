import type { Rupees } from "./money";

/** Admin-set allowed range for a service; a provider's rate must sit inside it. */
export type PriceBand = { min: Rupees; max: Rupees };

export type RateCheck =
  | { ok: true }
  | { ok: false; reason: "invalid" | "below_min" | "above_max" };

export function isValidBand(band: PriceBand): boolean {
  return Number.isFinite(band.min) && Number.isFinite(band.max) && band.min > 0 && band.max >= band.min;
}

/** Bounds are inclusive: a rate equal to min or max is allowed. */
export function checkRate(rate: Rupees, band: PriceBand): RateCheck {
  if (!Number.isFinite(rate) || rate <= 0 || !isValidBand(band)) return { ok: false, reason: "invalid" };
  if (rate < band.min) return { ok: false, reason: "below_min" };
  if (rate > band.max) return { ok: false, reason: "above_max" };
  return { ok: true };
}

export function clampToBand(rate: Rupees, band: PriceBand): Rupees {
  if (!isValidBand(band)) throw new Error("Invalid price band");
  if (!Number.isFinite(rate)) return band.min;
  return Math.min(band.max, Math.max(band.min, rate));
}

export function describeRateError(check: RateCheck, band: PriceBand): string | null {
  if (check.ok) return null;
  switch (check.reason) {
    case "below_min": return `Rate cannot be below ₹${band.min}.`;
    case "above_max": return `Rate cannot be above ₹${band.max}.`;
    default: return "Enter a valid rate.";
  }
}
