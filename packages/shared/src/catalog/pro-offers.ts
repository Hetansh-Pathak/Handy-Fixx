import type { Rupees } from "../money/money";
import { checkRate, isValidBand, type PriceBand } from "../money/price-band";

/**
 * Which jobs (sub-items) inside each service a pro does, and their own rate for each.
 * Stored in `provider_sub_items` (proposal 20261113000002), one row per ticked job.
 *
 * No rows for a service means "every job in it at the HandyFix price": pros who never opened the
 * My services screen stay bookable, and jobs added to the catalogue later reach them automatically.
 */
export type ProSubItemRow = {
  provider_id: string;
  sub_item_id: string;
  custom_price: number | string | null;
};

/** provider id → (sub-item id → own rate, null = HandyFix price). Holds one service's rows. */
export type ProOffers = Map<string, Map<string, Rupees | null>>;

const positive = (v: number | string | null | undefined): Rupees | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

export function groupProOffers(rows: readonly ProSubItemRow[]): ProOffers {
  const out: ProOffers = new Map();
  for (const r of rows) {
    const picks = out.get(r.provider_id) ?? new Map<string, Rupees | null>();
    picks.set(r.sub_item_id, positive(r.custom_price));
    out.set(r.provider_id, picks);
  }
  return out;
}

/** Whether the pro does this job. No job chosen, or no jobs ticked in this service, means yes. */
export function offersSubItem(offers: ProOffers, providerId: string, subItemId: string | null | undefined): boolean {
  if (!subItemId) return true;
  const picks = offers.get(providerId);
  return !picks || picks.size === 0 || picks.has(subItemId);
}

/** A job's band as stored (`service_sub_items.price_min/price_max`): either end may be missing. */
export type StoredBand = { min: number | string | null | undefined; max: number | string | null | undefined };

/** A band is usable only when both ends are set and in order; until then pros cannot set their own rate. */
export function readBand(band: StoredBand): PriceBand | null {
  const min = positive(band.min);
  const max = positive(band.max);
  return min !== null && max !== null && isValidBand({ min, max }) ? { min, max } : null;
}

/**
 * The pro's own rate for this job, or null to use the catalogue price. Like the booking trigger, a rate is
 * only used while it sits inside the job's current band (the admin may have narrowed it since).
 */
export function ownSubItemRate(offers: ProOffers, providerId: string, subItemId: string | null | undefined, band: StoredBand): Rupees | null {
  if (!subItemId) return null;
  const rate = offers.get(providerId)?.get(subItemId) ?? null;
  const range = readBand(band);
  return rate !== null && range && checkRate(rate, range).ok ? rate : null;
}

export type OwnRateCheck = { ok: true; price: Rupees | null } | { ok: false; error: string };

/**
 * Checks what the pro typed as their own rate. Blank means "use the HandyFix price".
 * Whole rupees only, inside the admin band; the database repeats this check.
 */
export function checkOwnRate(input: string, band: StoredBand): OwnRateCheck {
  const text = input.trim().replace(/^₹\s*/, "").replace(/,/g, "");
  if (!text) return { ok: true, price: null };
  if (!/^\d+$/.test(text)) return { ok: false, error: "Enter whole rupees, for example 349." };
  const price = Number(text);
  const range = readBand(band);
  if (!range) return { ok: false, error: "HandyFix has not set a price range for this job yet." };
  if (!checkRate(price, range).ok) return { ok: false, error: `Set a price between ₹${range.min} and ₹${range.max}.` };
  return { ok: true, price };
}

/** The rows to store for one service: nothing when every job is ticked at the HandyFix price. */
export function offerRowsForService(args: {
  subItemIds: readonly string[];
  ticked: ReadonlySet<string>;
  rates: ReadonlyMap<string, Rupees | null>;
}): { subItemId: string; customPrice: Rupees | null }[] {
  const picked = args.subItemIds.filter((id) => args.ticked.has(id));
  const anyRate = picked.some((id) => (args.rates.get(id) ?? null) !== null);
  if (picked.length === args.subItemIds.length && !anyRate) return [];
  return picked.map((id) => ({ subItemId: id, customPrice: args.rates.get(id) ?? null }));
}
