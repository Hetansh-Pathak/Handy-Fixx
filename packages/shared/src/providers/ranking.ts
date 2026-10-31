export type ProviderCard = {
  id: string;
  /** The provider's own rate for the service (inside the admin band). */
  price: number;
  rating: number | null;
  distanceKm: number | null;
  /** Average seconds to accept a request; lower is better. */
  avgResponseSeconds: number | null;
  isOnline?: boolean;
  kycApproved?: boolean;
  city?: string | null;
  pincodes?: readonly string[] | null;
};

export type ProviderSort = "cheapest" | "top_rated" | "nearest";

/** Nulls always sort last. */
const cmp = (a: number | null, b: number | null, dir: 1 | -1) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
};

const byId = (a: ProviderCard, b: ProviderCard) => a.id.localeCompare(b.id);

/**
 * Ranking compares what the customer can tell apart: a rating to one decimal (the card shows 4.7, so 4.74 and 4.70
 * are equal), distance within the same kilometre and response time within the same 30 seconds. Without these bands
 * an exact decimal rating would decide everything and distance and speed would never count.
 */
export const RATING_BAND = 0.1;
export const DISTANCE_BAND_KM = 1;
export const RESPONSE_BAND_SECONDS = 30;

const band = (value: number | null, size: number, how: "round" | "floor"): number | null =>
  value === null || !Number.isFinite(value) ? null : (how === "round" ? Math.round(value / size + 1e-9) : Math.floor(value / size)) ;

const ratingBand = (r: number | null) => band(r, RATING_BAND, "round");
const distanceBand = (d: number | null) => band(d, DISTANCE_BAND_KM, "floor");
const responseBand = (s: number | null) => band(s, RESPONSE_BAND_SECONDS, "floor");

/**
 * Default ordering: rating, then distance, then response speed. NEVER by money,
 * and featured slots are handled separately (PDF p.12).
 * @deprecated Instant dispatch (owner decision 2026-10-31): customers no longer pick a pro. Kept until the owner confirms it is unused; do not use in new code.
 */
export function rankProviders<T extends ProviderCard>(list: readonly T[]): T[] {
  return [...list].sort(rankCompare);
}

const rankCompare = (a: ProviderCard, b: ProviderCard) =>
  cmp(ratingBand(a.rating), ratingBand(b.rating), -1) ||
  cmp(distanceBand(a.distanceKm), distanceBand(b.distanceKm), 1) ||
  cmp(responseBand(a.avgResponseSeconds), responseBand(b.avgResponseSeconds), 1) ||
  // Inside the same bands the exact values still decide, so the order does not depend on the id alone.
  cmp(a.rating, b.rating, -1) ||
  cmp(a.distanceKm, b.distanceKm, 1) ||
  cmp(a.avgResponseSeconds, b.avgResponseSeconds, 1) ||
  byId(a, b);

/**
 * The customer's explicit sort choice on the "Choose a pro" screen.
 * @deprecated Instant dispatch (owner decision 2026-10-31): customers no longer pick a pro. Kept until the owner confirms it is unused; do not use in new code.
 */
export function sortProviders<T extends ProviderCard>(list: readonly T[], sort: ProviderSort): T[] {
  const primary: Record<ProviderSort, (a: T, b: T) => number> = {
    cheapest: (a, b) => a.price - b.price,
    top_rated: (a, b) => cmp(ratingBand(a.rating), ratingBand(b.rating), -1),
    nearest: (a, b) => cmp(a.distanceKm, b.distanceKm, 1),
  };
  return [...list].sort((a, b) => primary[sort](a, b) || rankCompare(a, b));
}

export const MAX_FEATURED_SLOTS = 2;
export const FEATURED_MIN_RATING = 4.3;

export const isFeaturedEligible = (p: ProviderCard) =>
  p.kycApproved === true && p.rating !== null && p.rating >= FEATURED_MIN_RATING;

/**
 * 1-2 clearly-marked featured slots first (only KYC-approved pros rated 4.3+), then everyone
 * else ranked normally. Money never moves a pro up the normal list.
 * @deprecated Instant dispatch (owner decision 2026-10-31): customers no longer pick a pro. Kept until the owner confirms it is unused; do not use in new code.
 */
export function orderWithFeatured<T extends ProviderCard>(
  list: readonly T[],
  featuredIds: ReadonlySet<string>,
): { featured: T[]; rest: T[] } {
  const ranked = rankProviders(list);
  const featured = ranked.filter((p) => featuredIds.has(p.id) && isFeaturedEligible(p)).slice(0, MAX_FEATURED_SLOTS);
  const taken = new Set(featured.map((p) => p.id));
  return { featured, rest: ranked.filter((p) => !taken.has(p.id)) };
}

export const NEXT_BEST_LIMIT = 3;
/** "Similar price" is not defined in the PDF; ±25% of the original price is the working default. */
export const SIMILAR_PRICE_TOLERANCE = 0.25;

/**
 * When a pro declines or the 30 s timer runs out: same area, similar price, online and
 * approved, never the pro(s) already tried, best-ranked first.
 * @deprecated Instant dispatch (owner decision 2026-10-31): customers no longer pick a pro. Kept until the owner confirms it is unused; do not use in new code.
 */
export function nextBestPros<T extends ProviderCard>(input: {
  candidates: readonly T[];
  excludeIds: ReadonlySet<string>;
  requestedPrice: number;
  pincode: string;
  city?: string | null;
  priceTolerance?: number;
  limit?: number;
}): T[] {
  const tol = input.priceTolerance ?? SIMILAR_PRICE_TOLERANCE;
  const lo = input.requestedPrice * (1 - tol);
  const hi = input.requestedPrice * (1 + tol);
  const sameArea = (p: T) =>
    p.pincodes?.includes(input.pincode) ||
    (!!input.city && !!p.city && p.city.trim().toLowerCase() === input.city.trim().toLowerCase());
  const eligible = input.candidates.filter(
    (p) =>
      !input.excludeIds.has(p.id) &&
      p.isOnline !== false &&
      p.kycApproved !== false &&
      p.price >= lo &&
      p.price <= hi &&
      sameArea(p),
  );
  return rankProviders(eligible).slice(0, input.limit ?? NEXT_BEST_LIMIT);
}
