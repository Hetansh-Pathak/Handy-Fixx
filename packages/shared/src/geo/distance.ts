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
