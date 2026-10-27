import { REQUEST_TIMEOUT_SECONDS } from "./request-timer";

export type RequestOutcome =
  | "waiting" // pending and still inside the 30 s window
  | "expired" // pending and the pro did not answer in time
  | "declined" // the pro said no
  | "accepted" // confirmed or later
  | "cancelled" // cancelled for another reason (by the customer, by admin)
  | "completed";

type DateLike = string | Date | null | undefined;

export const DECLINED_REASON = "Declined by provider";

/** Where a customer's request stands. The 30 s window runs from the moment the booking was created. */
export function requestOutcome(
  input: { status: string; createdAt: DateLike; cancellationReason?: string | null },
  now: Date,
  timeoutSeconds = REQUEST_TIMEOUT_SECONDS,
): RequestOutcome {
  switch (input.status) {
    case "pending": {
      const created = input.createdAt ? new Date(input.createdAt).getTime() : NaN;
      if (!Number.isFinite(created)) return "waiting";
      return (now.getTime() - created) / 1000 < timeoutSeconds ? "waiting" : "expired";
    }
    case "cancelled":
      return input.cancellationReason === DECLINED_REASON ? "declined" : "cancelled";
    case "completed":
      return "completed";
    default:
      return "accepted";
  }
}

/** Show "next best pros" when the pro said no or stayed silent (PDF p.4: "No starting over"). */
export const needsAlternatives = (o: RequestOutcome) => o === "expired" || o === "declined";

/** Seconds left in the pro's window, for the customer's "waiting…" line. */
export function waitSecondsLeft(createdAt: DateLike, now: Date, timeoutSeconds = REQUEST_TIMEOUT_SECONDS): number {
  const created = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(created)) return timeoutSeconds;
  return Math.min(timeoutSeconds, Math.max(0, Math.ceil(timeoutSeconds - (now.getTime() - created) / 1000)));
}
