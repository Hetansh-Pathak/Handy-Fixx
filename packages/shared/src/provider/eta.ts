/** Rough city travel speed used until a routing service is added. */
export const DEFAULT_TRAVEL_SPEED_KMH = 25;

/** Minutes to cover `km` at a steady speed, never below 1. Null for an invalid distance. */
export function estimateEtaMinutes(km: number, speedKmh = DEFAULT_TRAVEL_SPEED_KMH): number | null {
  if (!Number.isFinite(km) || km < 0 || !Number.isFinite(speedKmh) || speedKmh <= 0) return null;
  return Math.max(1, Math.ceil((km / speedKmh) * 60));
}
