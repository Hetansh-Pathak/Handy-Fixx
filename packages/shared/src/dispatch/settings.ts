import type { LatLng } from "../geo/distance";

/**
 * Rapido-style instant dispatch (owner decision 2026-10-31, replaces "customer picks a pro"). The customer picks a
 * service; the server offers the job to eligible pros in widening rings around the customer, and the first to accept
 * gets it. Every number here lives in the database row `dispatch_settings` (proposal 20261124000000) so HandyFix can
 * change it without an app release; these defaults are what the row starts with.
 */
export type DispatchSettings = {
  /** Rings 1..n measured from the customer, in km, each with how long to wait for an accept before widening. */
  rings: readonly { radiusKm: number; waitSeconds: number }[];
  /**
   * The last ring: every eligible pro inside the city zone. A centre and radius, not `service_providers.city`
   * (that column says "Ahmedabad" for every approved pro on the live project, checked 2026-10-31).
   */
  city: { name: string; centre: LatLng; radiusKm: number };
  /** The whole search ends after this many seconds from the start (the last ring stays open until then). */
  maxSearchSeconds: number;
  /** "Keep looking for 10 more minutes". */
  extendSeconds: number;
  /** A pro's heartbeat counts as online for this long (same rule as the customer list today). */
  presenceFreshSeconds: number;
};

export const DEFAULT_DISPATCH_SETTINGS: DispatchSettings = {
  rings: [
    { radiusKm: 2, waitSeconds: 10 },
    { radiusKm: 5, waitSeconds: 10 },
    { radiusKm: 10, waitSeconds: 10 },
  ],
  city: { name: "Jamnagar", centre: { latitude: 22.4707, longitude: 70.0577 }, radiusKm: 20 },
  maxSearchSeconds: 120,
  extendSeconds: 600,
  presenceFreshSeconds: 90,
};

const positive = (v: unknown, fallback: number): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : fallback;
};

const finite = (v: unknown, fallback: number): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};

/**
 * Reads the `dispatch_settings` row (snake_case, numerics may be strings). Anything missing or invalid falls back to
 * the default, and ring radii must grow, so a bad row can never stop dispatch.
 */
export function parseDispatchSettings(row: Record<string, unknown> | null | undefined): DispatchSettings {
  const d = DEFAULT_DISPATCH_SETTINGS;
  if (!row) return d;
  const radii = Array.isArray(row.ring_radii_km) ? row.ring_radii_km : null;
  const waits = Array.isArray(row.ring_wait_seconds) ? row.ring_wait_seconds : null;
  let rings = d.rings;
  if (radii && radii.length > 0) {
    const parsed = radii.map((r, i) => ({ radiusKm: positive(r, NaN), waitSeconds: positive(waits?.[i], 10) }));
    const growing = parsed.every((r, i) => Number.isFinite(r.radiusKm) && r.radiusKm > (parsed[i - 1]?.radiusKm ?? 0));
    if (growing) rings = parsed;
  }
  return {
    rings,
    city: {
      name: typeof row.city_name === "string" && row.city_name.trim() ? row.city_name.trim() : d.city.name,
      centre: { latitude: finite(row.city_lat, d.city.centre.latitude), longitude: finite(row.city_lng, d.city.centre.longitude) },
      radiusKm: positive(row.city_radius_km, d.city.radiusKm),
    },
    maxSearchSeconds: positive(row.max_search_seconds, d.maxSearchSeconds),
    extendSeconds: positive(row.extend_seconds, d.extendSeconds),
    presenceFreshSeconds: positive(row.presence_fresh_seconds, d.presenceFreshSeconds),
  };
}

/** Number of rings including the city-wide last one. */
export const ringCount = (s: DispatchSettings): number => s.rings.length + 1;
