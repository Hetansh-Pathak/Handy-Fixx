/**
 * One job at a time (owner rule, 2026-11-01): a pro who is busy cannot accept, or be offered, another job.
 * Busy = a job that is on the way, arrived or in progress, or a CONFIRMED job whose time window (start, plus the
 * service duration, plus a travel buffer on both sides) overlaps the new request.
 * SQL twin: `provider_busy_conflict` (proposal 20261126000000). Change both together.
 */
export const BUSY_STATUSES = ["on_the_way", "arrived", "in_progress"] as const;
/** Travel time kept free before and after a confirmed job. */
export const TRAVEL_BUFFER_MINUTES = 30;
/** Used when a service has no duration (services.duration_minutes is empty). */
export const DEFAULT_JOB_MINUTES = 60;

/** The message shown to the pro (the database raises the same sentence). */
export const BUSY_MESSAGE = "You already have a job at this time. Finish it first.";
export const BUSY_CTA = "Finish your current job first";

export type JobSlot = {
  id: string;
  status: string;
  /** Booked day, `YYYY-MM-DD`. */
  date: string | null | undefined;
  /** Booked start, `HH:MM` or `HH:MM:SS`. */
  time: string | null | undefined;
  /** The service duration; empty or not positive means `DEFAULT_JOB_MINUTES`. */
  durationMinutes?: number | null;
};

export type BusyResult =
  | { busy: false }
  | { busy: true; reason: "in_progress" | "overlap"; jobId: string; message: string };

const isBusyStatus = (status: string): boolean => (BUSY_STATUSES as readonly string[]).includes(status);

/** Local-time milliseconds of a booked day and time, or null when either is missing or not a real time. */
export function slotStartMs(date: string | null | undefined, time: string | null | undefined): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  const t = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!d || !t) return null;
  const [y, mo, day, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (h > 23 || mi > 59) return null;
  const ms = new Date(y, mo - 1, day, h, mi).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const minutes = (m: number | null | undefined): number => (typeof m === "number" && Number.isFinite(m) && m > 0 ? m : DEFAULT_JOB_MINUTES);

/**
 * Is this pro busy for `request`? `jobs` are the pro's own bookings (any status; others are ignored).
 * A job ending exactly one buffer before the request starts (or starting one buffer after it ends) does NOT conflict.
 * A confirmed job, or a request, without a readable time is ignored: the rule needs a time to compare.
 */
export function providerBusy(input: { jobs: readonly JobSlot[]; request: JobSlot }): BusyResult {
  const bufferMs = TRAVEL_BUFFER_MINUTES * 60_000;
  const rStart = slotStartMs(input.request.date, input.request.time);
  const rEnd = rStart === null ? null : rStart + minutes(input.request.durationMinutes) * 60_000;

  let overlap: JobSlot | null = null;
  for (const job of input.jobs) {
    if (job.id === input.request.id) continue;
    if (isBusyStatus(job.status)) return { busy: true, reason: "in_progress", jobId: job.id, message: BUSY_MESSAGE };
    if (job.status !== "confirmed" || rStart === null || rEnd === null) continue;
    const jStart = slotStartMs(job.date, job.time);
    if (jStart === null) continue;
    const jEnd = jStart + minutes(job.durationMinutes) * 60_000;
    if (rStart < jEnd + bufferMs && jStart < rEnd + bufferMs && overlap === null) overlap = job;
  }
  return overlap ? { busy: true, reason: "overlap", jobId: overlap.id, message: BUSY_MESSAGE } : { busy: false };
}
