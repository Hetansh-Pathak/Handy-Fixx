import { CUSTOMER_PLATFORM_FEE } from "../money/fee";
import { roundMoney, type Rupees } from "../money/money";

const valid = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * The price shown for one pro on one service.
 * - A chosen sub-item (e.g. "Tap repair") has a fixed catalogue price for every pro.
 * - Otherwise the pro's own rate for the service, falling back to the service's starting price.
 * Returns null when no usable price exists, so the card can hide "Book" instead of showing ₹0.
 */
export function resolveListedPrice(input: {
  subItemPrice?: number | null;
  customPrice?: number | null;
  basePrice?: number | null;
}): Rupees | null {
  if (valid(input.subItemPrice)) return input.subItemPrice;
  if (valid(input.customPrice)) return input.customPrice;
  if (valid(input.basePrice)) return input.basePrice;
  return null;
}

export type BookingQuote = {
  /** What the pro charges: the number on the card and on the confirm screen. */
  servicePrice: Rupees;
  /** Customers never pay a platform fee. */
  platformFee: Rupees;
  /** What the customer pays the pro (directly, by UPI or cash). */
  total: Rupees;
};

export function quoteBooking(servicePrice: Rupees): BookingQuote {
  const price = roundMoney(servicePrice);
  return { servicePrice: price, platformFee: CUSTOMER_PLATFORM_FEE, total: roundMoney(price + CUSTOMER_PLATFORM_FEE) };
}

export type StoredTotals = {
  provider_amount?: number | string | null;
  platform_fee?: number | string | null;
  total_amount?: number | string | null;
};

export type QuoteCheck =
  | { matches: true }
  | { matches: false; expectedTotal: Rupees; storedTotal: Rupees; storedFee: Rupees };

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Compares what the customer was shown with what the database actually saved. The database owns the
 * price (a trigger can overwrite what the app sends), so after booking the app must check that the
 * saved totals equal the quote instead of assuming it.
 */
export function reconcileQuote(quote: BookingQuote, stored: StoredTotals): QuoteCheck {
  const storedTotal = roundMoney(num(stored.total_amount));
  const storedFee = roundMoney(num(stored.platform_fee));
  if (storedTotal === quote.total && storedFee === quote.platformFee) return { matches: true };
  return { matches: false, expectedTotal: quote.total, storedTotal, storedFee };
}
