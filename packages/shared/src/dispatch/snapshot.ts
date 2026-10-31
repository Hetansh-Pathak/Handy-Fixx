import { distanceKm, readPoint, type LatLng } from "../geo/distance";
import { estimateEtaMinutes } from "../provider/eta";
import { readDispatchState, type DispatchState } from "./search";
import { parseDispatchSettings, ringCount, type DispatchSettings } from "./settings";

/** What `get_search_state` returns, read safely (numerics may be strings; anything missing gets a safe default). */
export type SearchSnapshot = {
  bookingId: string;
  state: DispatchState | null;
  status: string;
  ring: number;
  searchedSince: Date | null;
  searchEndsAt: Date | null;
  acceptedAt: Date | null;
  /** The server's clock when it answered, so the timer does not depend on the phone's clock. */
  serverNow: Date | null;
  notified: number;
  /** Notified pros, already rounded to about 1 km by the server. `key` is stable per booking and pro. */
  dots: { key: string; point: LatLng }[];
  pro: { id: string; name: string; rating: number | null; jobs: number; verified: boolean } | null;
  settings: DispatchSettings;
};

const date = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};

export function readSearchSnapshot(raw: unknown): SearchSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.booking_id !== "string") return null;
  const dots = Array.isArray(r.dots)
    ? r.dots.flatMap((d) => {
        const o = (d ?? {}) as Record<string, unknown>;
        const point = readPoint(o.lat, o.lng);
        return point ? [{ key: typeof o.key === "string" ? o.key : `${point.latitude},${point.longitude}`, point }] : [];
      })
    : [];
  const p = r.pro && typeof r.pro === "object" ? (r.pro as Record<string, unknown>) : null;
  return {
    bookingId: r.booking_id,
    state: readDispatchState(r.dispatch_state),
    status: typeof r.status === "string" ? r.status : "pending",
    ring: num(r.current_ring),
    searchedSince: date(r.searched_since),
    searchEndsAt: date(r.search_ends_at),
    acceptedAt: date(r.accepted_at),
    serverNow: date(r.now),
    notified: Math.max(0, Math.floor(num(r.notified))),
    dots,
    pro: p && typeof p.id === "string"
      ? { id: p.id, name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Your pro", rating: p.rating == null ? null : num(p.rating), jobs: num(p.jobs), verified: p.verified === true }
      : null,
    settings: parseDispatchSettings(r.settings && typeof r.settings === "object" ? (r.settings as Record<string, unknown>) : null),
  };
}

/** Seconds since the search started, measured on the server's clock (falls back to the phone's). */
export function searchElapsedSeconds(s: SearchSnapshot, phoneNow: Date, receivedAt: Date): number {
  if (!s.searchedSince) return 0;
  const serverNow = s.serverNow ? s.serverNow.getTime() + (phoneNow.getTime() - receivedAt.getTime()) : phoneNow.getTime();
  return Math.max(0, (serverNow - s.searchedSince.getTime()) / 1000);
}

/** How long the match took ("Pro found in 38 s"). */
export function matchSeconds(s: SearchSnapshot): number | null {
  if (!s.searchedSince || !s.acceptedAt) return null;
  return Math.max(1, (s.acceptedAt.getTime() - s.searchedSince.getTime()) / 1000);
}

/**
 * The drawn map is not to scale: the rings sit at fixed fractions of the radius so 2 km is visible next to a 20 km
 * city. Ring i of n (radius rings + the city) is at `RING_FRACTIONS`; distances in between are interpolated.
 */
export const MAP_RING_FRACTIONS = { first: 0.3, cityEdge: 0.92 } as const;

export function ringFractions(settings: DispatchSettings): number[] {
  // The drawn rings: the first radius ring, the middle radius rings, the city. With 2/5/10 km + city: 4 rings.
  const n = ringCount(settings);
  const { first, cityEdge } = MAP_RING_FRACTIONS;
  return Array.from({ length: n }, (_, i) => (n === 1 ? cityEdge : first + ((cityEdge - first) * i) / (n - 1)));
}

/** A distance (km) as a fraction of the drawn map radius, through the same ring scale. */
export function mapFraction(settings: DispatchSettings, km: number): number {
  const stops = [0, ...settings.rings.map((r) => r.radiusKm), Math.max(settings.city.radiusKm, (settings.rings[settings.rings.length - 1]?.radiusKm ?? 0) + 1)];
  const fr = [0, ...ringFractions(settings)];
  if (!Number.isFinite(km) || km <= 0) return 0;
  for (let i = 1; i < stops.length; i += 1) {
    const lo = stops[i - 1] ?? 0, hi = stops[i] ?? lo;
    if (km <= hi) return (fr[i - 1] ?? 0) + (((fr[i] ?? 1) - (fr[i - 1] ?? 0)) * (km - lo)) / Math.max(1e-9, hi - lo);
  }
  return 1;
}

/** Where a point is drawn, in -1..1 map units around the customer (x east, y south, like the screen). */
export function mapOffset(settings: DispatchSettings, customer: LatLng, p: LatLng): { x: number; y: number } {
  const km = distanceKm(customer, p);
  if (km === 0) return { x: 0, y: 0 };
  const dx = (p.longitude - customer.longitude) * Math.cos((customer.latitude * Math.PI) / 180);
  const dy = p.latitude - customer.latitude;
  const len = Math.hypot(dx, dy) || 1;
  const f = Math.min(1, mapFraction(settings, km));
  return { x: (dx / len) * f, y: (-dy / len) * f };
}

/** "8 min away" for the found pro, from the (rounded) dot. */
export function etaLine(customer: LatLng, pro: LatLng | null): string | null {
  if (!pro) return null;
  const min = estimateEtaMinutes(distanceKm(customer, pro));
  return min === null ? null : `${Math.max(1, min)} min away`;
}
