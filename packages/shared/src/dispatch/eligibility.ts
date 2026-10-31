import { isPresenceFresh } from "../catalog/availability";
import { distanceKm, type LatLng } from "../geo/distance";
import type { Rupees } from "../money/money";
import { checkCanAccept, type WalletState } from "../money/wallet";
import { isInCity, ringForDistance } from "./ring-plan";
import { ringCount, type DispatchSettings } from "./settings";

/** What the server knows about a pro when it looks for one (SQL twin: `dispatch_candidates`). */
export type DispatchCandidate = {
  providerId: string;
  kycStatus: string | null;
  status: string | null;
  isOnline: boolean | null;
  /** Last heartbeat (`provider_presence.updated_at`). */
  heartbeatAt: string | Date | null;
  serviceIds: readonly string[] | null;
  /** Position from the heartbeat; never shown to customers as is. */
  location: LatLng | null;
  /** The pro's service area from their profile (`service_providers.pincodes`: pincodes or place names). */
  serviceArea?: readonly string[] | null;
  rating: number | null;
};

export type IneligibleReason = "kyc" | "inactive" | "offline" | "stale" | "no_service" | "no_location" | "too_far";

export type Eligibility =
  | { ok: true; distanceKm: number; ring: number; byServiceArea?: true }
  | { ok: false; reason: IneligibleReason };

/** The pro's profile says they work in the city: its name, or a pincode with the city's prefix (SQL twin: same test). */
export function servesCity(area: readonly string[] | null | undefined, city: { name: string; pincodePrefix: string }): boolean {
  const name = city.name.trim().toLowerCase();
  return (area ?? []).some((a) => {
    const v = a.trim().toLowerCase();
    return v === name || (/^\d{6}$/.test(v) && v.startsWith(city.pincodePrefix));
  });
}

/**
 * Owner rule: approved, active, online, fresh heartbeat, offers the service, and inside a ring. Rings 1..n use the
 * live GPS position. The city ring also takes a pro whose service area is the city when their GPS is missing or
 * outside it (owner, 2026-10-31: a PC browser guesses its position from the internet line, e.g. "Ahmedabad"); their
 * distance is shown as the customer's distance to the city centre. The wallet is NOT a reason to skip a pro: a low
 * wallet gets the offer as "Top up ₹X to accept" (see `offerAccess`).
 */
export function dispatchEligibility(
  c: DispatchCandidate,
  input: { serviceId: string; customer: LatLng; settings: DispatchSettings; now: Date },
): Eligibility {
  if (c.kycStatus !== "approved") return { ok: false, reason: "kyc" };
  if (c.status !== "active") return { ok: false, reason: "inactive" };
  if (!c.isOnline) return { ok: false, reason: "offline" };
  if (!isPresenceFresh(c.heartbeatAt, input.now, input.settings.presenceFreshSeconds)) return { ok: false, reason: "stale" };
  if (!(c.serviceIds ?? []).includes(input.serviceId)) return { ok: false, reason: "no_service" };
  const byArea = (): Eligibility => ({
    ok: true, ring: ringCount(input.settings), byServiceArea: true, distanceKm: distanceKm(input.customer, input.settings.city.centre),
  });
  if (!c.location) return servesCity(c.serviceArea, input.settings.city) ? byArea() : { ok: false, reason: "no_location" };
  const km = distanceKm(input.customer, c.location);
  const ring = ringForDistance(input.settings, km, isInCity(input.settings, c.location));
  if (ring === null) return servesCity(c.serviceArea, input.settings.city) ? byArea() : { ok: false, reason: "too_far" };
  return { ok: true, distanceKm: km, ring };
}

/** Who is asked first inside a ring: nearest, then best rated, then a stable tie-break. Never by money. */
export function orderForOffers<T extends { distanceKm: number; rating: number | null; providerId: string }>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => a.distanceKm - b.distanceKm || (b.rating ?? 0) - (a.rating ?? 0) || a.providerId.localeCompare(b.providerId),
  );
}

export type OfferAccess = { canAccept: true; fee: Rupees; feeWaived: boolean } | { canAccept: false; fee: Rupees; topUp: Rupees };

/**
 * The existing wallet accept-check, as the pro's offer card shows it. The database repeats it inside
 * `accept_dispatch_offer` (live trigger `enforce_wallet_before_accept`), so this is only for the button text.
 */
export function offerAccess(input: { wallet: WalletState; price: Rupees; launchActive: boolean }): OfferAccess {
  const check = checkCanAccept({ wallet: input.wallet, estimatedServiceBill: input.price, launchActive: input.launchActive });
  if (check.ok) return { canAccept: true, fee: check.fee, feeWaived: check.feeWaived };
  return { canAccept: false, fee: check.fee, topUp: check.suggestedTopUp };
}
