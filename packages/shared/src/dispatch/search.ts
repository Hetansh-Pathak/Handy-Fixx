import { approxPoint, distanceKm, formatDistance, type LatLng } from "../geo/distance";
import { formatInr, type Rupees } from "../money/money";
import { ringCount, type DispatchSettings } from "./settings";

/** `bookings.dispatch_state` (proposal 20261124000000). A searching booking is status 'pending' with no pro. */
export const DISPATCH_STATES = ["searching", "assigned", "no_pro", "cancelled"] as const;
export type DispatchState = (typeof DISPATCH_STATES)[number];

export type SearchEvent = "accepted" | "time_up" | "customer_cancelled" | "keep_looking";

/** Allowed moves; null = refused (e.g. a pro accepting after the customer cancelled). SQL twin: the state checks in the RPCs. */
export function searchTransition(from: DispatchState, event: SearchEvent): DispatchState | null {
  if (from === "searching") {
    if (event === "accepted") return "assigned";
    if (event === "time_up") return "no_pro";
    if (event === "customer_cancelled") return "cancelled";
    return null;
  }
  if (from === "no_pro") {
    if (event === "keep_looking") return "searching";
    if (event === "customer_cancelled") return "cancelled";
    return null;
  }
  return null;
}

export function readDispatchState(v: unknown): DispatchState | null {
  return (DISPATCH_STATES as readonly unknown[]).includes(v) ? (v as DispatchState) : null;
}

/** The status line under "Finding your pro", per open ring. */
export function searchStatusText(settings: DispatchSettings, ring: number): string {
  const last = ringCount(settings);
  if (ring >= last) return `Asking all pros in ${settings.city.name}`;
  const r = settings.rings[Math.max(0, ring - 1)];
  if (!r) return `Asking pros within ${settings.rings[0]?.radiusKm ?? 2} km`;
  return ring <= 1 ? `Asking pros within ${r.radiusKm} km` : `Widening to ${r.radiusKm} km`;
}

export type StageChip = { label: string; state: "done" | "active" | "pending" };

/**
 * Three chips on the sheet: nearby (ring 1), wider (the middle rings), whole city (last ring). With the default rings:
 * "2 km", "5-10 km", "Jamnagar".
 */
export function stageChips(settings: DispatchSettings, ring: number): StageChip[] {
  const last = ringCount(settings);
  const middle = settings.rings.slice(1);
  const stages: { label: string; from: number; to: number }[] = [
    { label: `${settings.rings[0]?.radiusKm ?? 2} km`, from: 1, to: 1 },
    {
      label: middle.length > 1 ? `${middle[0]?.radiusKm}-${middle[middle.length - 1]?.radiusKm} km` : `${middle[0]?.radiusKm ?? ""} km`,
      from: 2,
      to: last - 1,
    },
    { label: settings.city.name, from: last, to: last },
  ];
  return stages.map((s) => ({ label: s.label, state: ring > s.to ? "done" : ring >= s.from ? "active" : "pending" }));
}

export function notifiedLine(count: number): string {
  if (count <= 0) return "Looking for pros near you. No charge for cancelling.";
  return `${count} ${count === 1 ? "pro" : "pros"} notified. The first to accept gets your job. No charge for cancelling.`;
}

/** "0:38" for the timer chip. */
export function elapsedLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Pro found in 38 s" / "Pro found in 1 min 5 s". */
export function foundBadge(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  return s < 60 ? `Pro found in ${s} s` : `Pro found in ${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`;
}

/** One price for everyone (owner decision): the job's catalogue price, else the service price. Platform fee ₹0. */
export function dispatchPrice(input: { subItemPrice?: number | string | null; basePrice?: number | string | null }): { price: Rupees; platformFee: 0 } | null {
  for (const v of [input.subItemPrice, input.basePrice]) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return { price: n, platformFee: 0 };
  }
  return null;
}

export const confirmButtonLabel = (price: Rupees): string => `Find a pro · ${formatInr(price)}`;

/** A customer outside the city zone gets this instead of a search. */
export function outsideCityMessage(settings: DispatchSettings): string {
  return `apnabanda works in ${settings.city.name} for now. Pick an address in ${settings.city.name}.`;
}

/** Stable small number from a string, so a pro's dot does not jump around between polls. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/**
 * Where a notified pro's amber dot is drawn on the customer's map: rounded to about 1 km (`approxPoint`) and moved a
 * further up to `jitterMetres` in a direction fixed per booking and pro. The exact position never leaves the server
 * (the SQL twin already returns it rounded); this keeps the dot stable and vague on the phone too.
 */
export function jitteredPoint(p: LatLng, seed: string, jitterMetres = 300): LatLng | null {
  const base = approxPoint(p);
  if (!base) return null;
  const angle = hash(`${seed}:a`) * 2 * Math.PI;
  const dist = (0.3 + 0.7 * hash(`${seed}:d`)) * jitterMetres;
  const dLat = (dist * Math.cos(angle)) / 111_320;
  const dLng = (dist * Math.sin(angle)) / (111_320 * Math.cos((base.latitude * Math.PI) / 180));
  return { latitude: base.latitude + dLat, longitude: base.longitude + dLng };
}

/** "about 1.5 km away" on the pro's offer card (to the nearest half km, never exact). */
export function approxDistanceLine(from: LatLng, to: LatLng): string {
  const km = Math.max(0.5, Math.round(distanceKm(from, to) * 2) / 2);
  return `about ${formatDistance(km)} away`;
}
