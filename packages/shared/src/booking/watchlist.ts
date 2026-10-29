/**
 * Admin watchlist (HandyFix-complete.pdf p.9 "watches for pending requests over 15 min", p.12 "flag suspicious pros:
 * high acceptance but low completions", p.11 "repeated no-shows lower the pro's ranking"). Pure rules on booking rows the
 * admin can already read; nothing here changes data.
 */

export const PENDING_WATCH_MINUTES = 15;

type DateLike = string | Date | null | undefined;
const toMs = (v: DateLike): number | null => {
  if (!v) return null;
  const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/** Whole minutes a request has been waiting, or null for an unreadable time. Never negative. */
export function minutesWaiting(createdAt: DateLike, now: Date): number | null {
  const created = toMs(createdAt);
  if (created === null) return null;
  return Math.max(0, Math.floor((now.getTime() - created) / 60_000));
}

/** A pending request nobody has answered for 15 minutes or more. */
export function isPendingTooLong(input: { status: string; createdAt: DateLike; now: Date }): boolean {
  if (input.status !== "pending") return false;
  const m = minutesWaiting(input.createdAt, input.now);
  return m !== null && m >= PENDING_WATCH_MINUTES;
}

/** ISO time before which a pending request counts as "waiting too long": the admin query filters on `created_at` older than this. */
export function pendingWatchCutoff(now: Date): string {
  return new Date(now.getTime() - PENDING_WATCH_MINUTES * 60_000).toISOString();
}

// ── provider activity and flags ────────────────────────────────────────────────

/** An accepted job with no change for this long is counted as abandoned (never finished, never cancelled). */
export const ABANDONED_AFTER_HOURS = 48;
/** Admin cancel reasons that mean the pro let the customer down (admin Bookings cancel list). */
export const PROVIDER_FAULT_CANCEL_REASONS = ["Provider unavailable", "No-show", "Repeated no-shows"] as const;
export const DECLINE_REASON = "Declined by provider";

export const FLAG_MIN_ACCEPTED = 5;
export const FLAG_HIGH_ACCEPTANCE = 0.8;
export const FLAG_LOW_COMPLETION = 0.6;
export const FLAG_MIN_DECLINES = 5;
export const FLAG_DECLINE_SHARE = 0.5;

export type ActivityRow = {
  provider_id: string | null;
  status: string;
  cancellation_reason?: string | null;
  updated_at?: DateLike;
};

export type ProviderActivity = {
  providerId: string;
  /** Requests addressed to this pro in the window. */
  requests: number;
  declined: number;
  completed: number;
  /** Accepted and still going (recent). */
  active: number;
  /** Accepted but never finished: stale for 48 h, or cancelled for a pro-fault reason. */
  abandoned: number;
  /** completed + abandoned + active */
  accepted: number;
  /** accepted / (accepted + declined); null when the pro answered nothing. */
  acceptanceRate: number | null;
  /** completed / (completed + abandoned); null before anything has finished or failed. */
  completionRate: number | null;
};

const ACCEPTED_LIVE = new Set(["confirmed", "on_the_way", "arrived", "in_progress"]);

const isProviderFault = (reason: string | null | undefined) =>
  !!reason && PROVIDER_FAULT_CANCEL_REASONS.some((r) => reason.toLowerCase().includes(r.toLowerCase()));

/** Counts per pro from booking rows. A row without a pro is ignored. */
export function summariseProviderActivity(rows: readonly ActivityRow[], now: Date): ProviderActivity[] {
  const byPro = new Map<string, { requests: number; declined: number; completed: number; active: number; abandoned: number }>();
  const staleBefore = now.getTime() - ABANDONED_AFTER_HOURS * 3_600_000;
  for (const r of rows) {
    if (!r.provider_id) continue;
    const c = byPro.get(r.provider_id) ?? { requests: 0, declined: 0, completed: 0, active: 0, abandoned: 0 };
    c.requests += 1;
    if (r.status === "completed") c.completed += 1;
    else if (r.status === "cancelled") {
      if (r.cancellation_reason === DECLINE_REASON) c.declined += 1;
      else if (isProviderFault(r.cancellation_reason)) c.abandoned += 1;
    } else if (ACCEPTED_LIVE.has(r.status)) {
      const updated = toMs(r.updated_at);
      if (updated !== null && updated < staleBefore) c.abandoned += 1;
      else c.active += 1;
    }
    byPro.set(r.provider_id, c);
  }
  return [...byPro.entries()].map(([providerId, c]) => {
    const accepted = c.completed + c.active + c.abandoned;
    const finished = c.completed + c.abandoned;
    return {
      providerId, ...c, accepted,
      acceptanceRate: accepted + c.declined > 0 ? accepted / (accepted + c.declined) : null,
      completionRate: finished > 0 ? c.completed / finished : null,
    };
  });
}

export type ProviderFlag = { code: "low_completion" | "repeated_declines"; severity: "high" | "watch"; message: string };

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Why an admin should look at this pro. Signals, not verdicts: the wording never accuses. */
export function providerFlags(a: ProviderActivity): ProviderFlag[] {
  const flags: ProviderFlag[] = [];
  if (a.acceptanceRate !== null && a.completionRate !== null && a.accepted >= FLAG_MIN_ACCEPTED
      && a.acceptanceRate >= FLAG_HIGH_ACCEPTANCE && a.completionRate < FLAG_LOW_COMPLETION) {
    flags.push({
      code: "low_completion", severity: "high",
      message: `Accepts ${pct(a.acceptanceRate)} of requests but finishes only ${pct(a.completionRate)} (${a.completed} done, ${a.abandoned} not finished).`,
    });
  }
  if (a.declined >= FLAG_MIN_DECLINES && a.declined / a.requests >= FLAG_DECLINE_SHARE) {
    flags.push({
      code: "repeated_declines", severity: "watch",
      message: `Declined ${a.declined} of ${a.requests} requests (${pct(a.declined / a.requests)}). Repeated declines lower the pro's ranking.`,
    });
  }
  return flags;
}

/** Pros with at least one flag, most serious first, then by how many jobs were left unfinished. */
export function flaggedProviders(activity: readonly ProviderActivity[]): { activity: ProviderActivity; flags: ProviderFlag[] }[] {
  return activity
    .map((a) => ({ activity: a, flags: providerFlags(a) }))
    .filter((x) => x.flags.length > 0)
    .sort((x, y) =>
      Number(y.flags.some((f) => f.severity === "high")) - Number(x.flags.some((f) => f.severity === "high"))
      || y.activity.abandoned - x.activity.abandoned
      || y.activity.declined - x.activity.declined
      || x.activity.providerId.localeCompare(y.activity.providerId));
}
