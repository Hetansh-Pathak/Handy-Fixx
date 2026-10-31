import { distanceKm, type LatLng } from "../geo/distance";
import { ringCount, type DispatchSettings } from "./settings";

/**
 * Which ring a pro belongs to, seen from the customer: the first ring whose radius covers them (1-based), else the
 * city-wide last ring when they are inside the city zone, else null (too far, never offered).
 */
export function ringForDistance(settings: DispatchSettings, km: number, proInCity: boolean): number | null {
  if (!Number.isFinite(km) || km < 0) return null;
  const i = settings.rings.findIndex((r) => km <= r.radiusKm);
  if (i >= 0) return i + 1;
  return proInCity ? ringCount(settings) : null;
}

export const isInCity = (settings: DispatchSettings, p: LatLng): boolean =>
  distanceKm(settings.city.centre, p) <= settings.city.radiusKm;

/**
 * The search clock as stored on the booking: `ring` = the ring that is open now (0 before the first tick),
 * `ringDeadline` = when it widens (null on the last ring, which stays open until `endsAt`).
 */
export type SearchClock = { ring: number; ringDeadline: Date | null; endsAt: Date };

export type TickResult =
  | { kind: "wait"; clock: SearchClock }
  | { kind: "opened"; clock: SearchClock; skipped: number[] }
  | { kind: "no_pro"; reason: "time_up" | "nobody_online" };

/**
 * One step of the server tick (SQL twin: `dispatch_tick` in proposal 20261124000000). Rings are cumulative: opening
 * ring N offers the job to every eligible pro within N who has no offer yet, and earlier offers stay open.
 *
 * `newPros(ring)` = eligible pros that ring N would ADD (not offered before). A ring that adds nobody is skipped at
 * once, so nobody waits 10 seconds for no one. When even the city-wide ring has nobody, the search ends straight away
 * ("No pro available right now"), which is what a customer sees when no pro is online at all.
 */
export function tickSearch(input: {
  settings: DispatchSettings;
  clock: SearchClock;
  now: Date;
  newPros: (ring: number) => number;
  /** Offers already sent and still open (a later ring can be empty while earlier pros may still accept). */
  openOffers: number;
}): TickResult {
  const { settings, clock, now } = input;
  const last = ringCount(settings);
  if (now.getTime() >= clock.endsAt.getTime()) return { kind: "no_pro", reason: "time_up" };
  if (clock.ring >= last) return { kind: "wait", clock };
  if (clock.ring > 0 && clock.ringDeadline && now.getTime() < clock.ringDeadline.getTime()) return { kind: "wait", clock };

  const skipped: number[] = [];
  let next = clock.ring + 1;
  while (next < last && input.newPros(next) === 0) {
    skipped.push(next);
    next += 1;
  }
  if (next === last && input.newPros(last) === 0 && input.openOffers === 0) return { kind: "no_pro", reason: "nobody_online" };
  const wait = next < last ? settings.rings[next - 1]?.waitSeconds ?? null : null;
  return {
    kind: "opened",
    skipped,
    clock: { ring: next, ringDeadline: wait === null ? null : new Date(now.getTime() + wait * 1000), endsAt: clock.endsAt },
  };
}

/** A new search: nothing open yet; the first tick opens ring 1 (or the first ring with anyone in it). */
export function newSearchClock(settings: DispatchSettings, startedAt: Date): SearchClock {
  return { ring: 0, ringDeadline: null, endsAt: new Date(startedAt.getTime() + settings.maxSearchSeconds * 1000) };
}

/** "Keep looking for 10 more minutes": the city-wide ring stays open until the new end. */
export function extendSearchClock(settings: DispatchSettings, now: Date): SearchClock {
  return { ring: ringCount(settings), ringDeadline: null, endsAt: new Date(now.getTime() + settings.extendSeconds * 1000) };
}
