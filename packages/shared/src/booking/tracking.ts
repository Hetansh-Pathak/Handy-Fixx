import { distanceKm, formatDistance, type LatLng } from "../geo/distance";
import { estimateEtaMinutes } from "../provider/eta";

/** A position older than this is shown as "last seen", not as live. */
export const LOCATION_STALE_SECONDS = 60;

type DateLike = string | Date | null | undefined;

export type TrackingSummary = {
  hasLocation: boolean;
  /** "2.4 km away", or "" when the pro has not shared a position yet. */
  distanceText: string;
  /** "12 min", or "" when neither the pro's ETA nor a distance is known. */
  etaText: string;
  /** The last position is older than LOCATION_STALE_SECONDS (phone offline, app closed). */
  stale: boolean;
  /** Seconds since the last position, null if unknown. */
  ageSeconds: number | null;
};

/**
 * What the customer sees while the pro travels. The pro's own ETA (written every 30 s from their phone) wins;
 * otherwise it is estimated from the straight-line distance.
 */
export function trackingSummary(input: {
  pro: LatLng | null;
  destination: LatLng | null;
  etaMinutes: number | null | undefined;
  updatedAt: DateLike;
  now: Date;
}): TrackingSummary {
  const updated = input.updatedAt ? new Date(input.updatedAt).getTime() : NaN;
  const ageSeconds = Number.isFinite(updated) ? Math.max(0, Math.round((input.now.getTime() - updated) / 1000)) : null;
  const km = input.pro && input.destination ? distanceKm(input.pro, input.destination) : null;

  const minutes =
    typeof input.etaMinutes === "number" && Number.isFinite(input.etaMinutes) && input.etaMinutes > 0
      ? Math.round(input.etaMinutes)
      : km !== null
        ? estimateEtaMinutes(km)
        : null;

  return {
    hasLocation: !!input.pro,
    distanceText: km !== null ? `${formatDistance(km)} away` : "",
    etaText: minutes !== null ? `${minutes} min` : "",
    stale: !!input.pro && (ageSeconds === null || ageSeconds > LOCATION_STALE_SECONDS),
    ageSeconds,
  };
}
