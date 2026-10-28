const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export type LatLng = { latitude: number; longitude: number };

/** Great-circle distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "350 m" under 1 km, otherwise "2.4 km". */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  const metres = Math.round(km * 100) * 10; // nearest 10 m
  if (metres < 1000) return `${metres} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export const APPROX_DECIMALS = 2;

/**
 * A pro's area, rounded to about 1 km, is all customers ever get for "Nearest". The exact position of a pro
 * who is not on a job is never stored. Null when the numbers are not a place on Earth.
 */
export function approxPoint(p: LatLng): LatLng | null {
  if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return null;
  if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) return null;
  const f = 10 ** APPROX_DECIMALS;
  return { latitude: Math.round(p.latitude * f) / f, longitude: Math.round(p.longitude * f) / f };
}

/** Postgres numerics come back as strings; this turns a pair of them into a point, or null. */
export function readPoint(lat: unknown, lng: unknown): LatLng | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === "" || lng === "") return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
