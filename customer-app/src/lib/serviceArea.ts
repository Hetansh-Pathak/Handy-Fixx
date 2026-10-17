/**
 * Providers store the CITIES they serve (e.g. "Ahmedabad") in `service_providers.pincodes`, but customers browse
 * with a 6-digit PINCODE (Home, tab bar, Profile all pass ?pincode=380001). Comparing the two never matched, so a
 * customer with a pincode saw no providers at all. This decides, in one place, whether a provider serves an area.
 */
const PINCODE = /^\d{6}$/;
const norm = (s: string) => s.trim().toLowerCase();

export const isPincode = (v: string) => PINCODE.test(v.trim());

/**
 * @param areas     what the provider lists (city names and/or pincodes)
 * @param query     what the customer browsed with: a city name, a pincode, or ""
 * @param knownCity the customer's saved city, used when `query` is a pincode
 * An unresolvable pincode does NOT hide everyone: the customer sees online providers and chooses.
 */
export function servesArea(areas: string[] | null | undefined, query: string, knownCity?: string | null): boolean {
  const q = norm(query ?? "");
  if (!q) return true;
  const list = (areas ?? []).map(norm);
  if (list.includes(q)) return true;
  if (isPincode(q)) {
    const city = norm(knownCity ?? "");
    if (city) return list.includes(city);
    return true;
  }
  return false;
}

/** Online means the flag is set AND the heartbeat is recent. A view without updated_at falls back to the flag. */
export function isFresh(updatedAt: string | null | undefined, now = Date.now(), maxAgeMs = 120_000): boolean {
  if (!updatedAt) return true;
  const t = new Date(updatedAt).getTime();
  return Number.isFinite(t) && now - t <= maxAgeMs;
}
