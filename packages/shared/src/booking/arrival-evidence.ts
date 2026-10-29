import { distanceKm, formatDistance, readPoint } from "../geo/distance";

/** Within this many km of the job address counts as "at the address" (GPS drifts indoors and in dense streets). */
export const ARRIVAL_NEAR_KM = 0.3;

export type ArrivalEvidence =
  | { state: "not_recorded"; line: string }
  | { state: "time_only"; at: string; line: string }
  | { state: "near" | "far"; at: string; distanceKm: number; line: string };

/**
 * What the admin reads about the pro's arrival (PDF p.11 "arrival location"). The pro's position when they tapped
 * "I've arrived" is compared with the job's own coordinates. It is evidence, not a verdict: the wording only says
 * how far apart the two points were.
 */
export function describeArrival(input: { at?: unknown; lat?: unknown; lng?: unknown; jobLat?: unknown; jobLng?: unknown }): ArrivalEvidence {
  const at = typeof input.at === "string" && input.at && Number.isFinite(new Date(input.at).getTime()) ? input.at : null;
  if (!at) return { state: "not_recorded", line: "No arrival was recorded for this job." };

  const arrived = readPoint(input.lat, input.lng);
  const job = readPoint(input.jobLat, input.jobLng);
  if (!arrived) return { state: "time_only", at, line: "Arrival time recorded; the pro's position was not available." };
  if (!job) return { state: "time_only", at, line: "Arrival recorded with a position, but the job address has no coordinates to compare." };

  const km = distanceKm(arrived, job);
  const text = formatDistance(km) || "an unknown distance";
  return km <= ARRIVAL_NEAR_KM
    ? { state: "near", at, distanceKm: km, line: `Arrived about ${text} from the job address.` }
    : { state: "far", at, distanceKm: km, line: `Arrived about ${text} from the job address. Check this with both sides.` };
}

/** A Google Maps link for a recorded point, or null. */
export function mapsLink(lat: unknown, lng: unknown): string | null {
  const p = readPoint(lat, lng);
  return p ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}` : null;
}
