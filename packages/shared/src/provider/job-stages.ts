import { isRequestOpen } from "./request";

/** The pro's Jobs tabs, in the order a job moves through them. */
export type JobStage = "new" | "accepted" | "on_the_way" | "started" | "completed" | "cancelled";

export const JOB_STAGES: readonly { key: JobStage; label: string; empty: string }[] = [
  { key: "new", label: "New", empty: "No new requests. They appear here and as a popup while you are online." },
  { key: "accepted", label: "Accepted", empty: "Jobs you accepted that have not started yet." },
  { key: "on_the_way", label: "On the way", empty: "Jobs you are travelling to or have reached." },
  { key: "started", label: "Started", empty: "Jobs you are working on now." },
  { key: "completed", label: "Completed", empty: "Finished jobs appear here." },
  { key: "cancelled", label: "Cancelled", empty: "Declined, cancelled and missed requests." },
];

/**
 * Which tab a booking belongs in. A request whose booked time passed without an answer counts as cancelled
 * ("missed"): it can no longer be accepted.
 */
export function jobStage(b: { status: string; booking_date?: string | null; booking_time?: string | null }, now: Date): JobStage {
  switch (b.status) {
    case "pending":
      return isRequestOpen({ status: b.status, bookingDate: b.booking_date, bookingTime: b.booking_time }, now) ? "new" : "cancelled";
    case "confirmed":
      return "accepted";
    case "on_the_way":
    case "arrived":
      return "on_the_way";
    case "in_progress":
      return "started";
    case "completed":
      return "completed";
    default:
      return "cancelled";
  }
}

/** The tab to open first: new requests, then the job in hand, then what is coming up. */
export function defaultJobStage(counts: Readonly<Record<JobStage, number>>): JobStage {
  const order: JobStage[] = ["new", "started", "on_the_way", "accepted"];
  return order.find((s) => counts[s] > 0) ?? "new";
}

export function countByStage<T extends { status: string; booking_date?: string | null; booking_time?: string | null }>(
  rows: readonly T[],
  now: Date,
): Record<JobStage, number> {
  const counts: Record<JobStage, number> = { new: 0, accepted: 0, on_the_way: 0, started: 0, completed: 0, cancelled: 0 };
  for (const r of rows) counts[jobStage(r, now)] += 1;
  return counts;
}
