/** Fewest accepted requests before a response time is shown or used for ranking (one fast reply proves nothing). */
export const MIN_RESPONSE_SAMPLES = 3;

/** "Replies in about 2 min" for a pro's average time to accept; null when there is nothing trustworthy to show. */
export function formatResponseTime(seconds: number | null | undefined, samples: number | null | undefined = MIN_RESPONSE_SAMPLES): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
  if ((samples ?? 0) < MIN_RESPONSE_SAMPLES) return null;
  if (seconds < 60) return "Replies in under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Replies in about ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours >= 24 ? "Replies within a day" : `Replies in about ${hours} h`;
}

export type ResponseTimeRow = { provider_id: string; avg_seconds: number | string | null; samples: number | string | null };

/** Reads the rows of provider_response_times() defensively into a map; rows with too few samples are dropped. */
export function responseTimeMap(rows: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows as Partial<ResponseTimeRow>[]) {
    if (!r || typeof r.provider_id !== "string") continue;
    // Number(null) and Number("") are 0: a missing average must never read as "fastest".
    if (r.avg_seconds === null || r.avg_seconds === undefined || r.avg_seconds === "") continue;
    const seconds = Number(r.avg_seconds);
    const samples = Number(r.samples);
    if (Number.isFinite(seconds) && seconds >= 0 && Number.isFinite(samples) && samples >= MIN_RESPONSE_SAMPLES) out.set(r.provider_id, seconds);
  }
  return out;
}
