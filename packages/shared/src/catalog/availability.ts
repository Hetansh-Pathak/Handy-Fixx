/**
 * A pro counts as "online" only while the app keeps refreshing `service_providers.updated_at`
 * (the old provider portal sent a heartbeat every 30 s). Older than this means the pro closed
 * the app, so they are hidden from customers.
 */
export const PRESENCE_FRESH_SECONDS = 90;

type DateLike = string | Date | null | undefined;

const toMs = (v: DateLike): number | null => {
  if (!v) return null;
  const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export function isPresenceFresh(updatedAt: DateLike, now: Date, seconds = PRESENCE_FRESH_SECONDS): boolean {
  const ms = toMs(updatedAt);
  return ms !== null && now.getTime() - ms <= seconds * 1000;
}

export function isProviderAvailable(p: { isOnline: boolean | null | undefined; updatedAt: DateLike }, now: Date): boolean {
  return p.isOnline === true && isPresenceFresh(p.updatedAt, now);
}

/**
 * Whether a pro offers a service. A pro with no services listed is treated as offering all of them:
 * this matches the old customer app so existing pros with missing data stay visible.
 */
export function offersService(serviceIds: readonly string[] | null | undefined, serviceId: string): boolean {
  if (!serviceIds || serviceIds.length === 0) return true;
  return serviceIds.includes(serviceId);
}

/**
 * `area` is what the customer typed (a city or a 6-digit pincode). Pros list the cities/pincodes they
 * cover in `pincodes`. Matching is exact and case-insensitive; a blank area matches everyone.
 */
export function servesArea(coverage: readonly string[] | null | undefined, area: string): boolean {
  const wanted = area.trim().toLowerCase();
  if (!wanted) return true;
  return (coverage ?? []).some((c) => c.trim().toLowerCase() === wanted);
}
