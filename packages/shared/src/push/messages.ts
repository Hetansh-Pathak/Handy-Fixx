/**
 * What a phone notification says, for each event HandyFix already records in provider_notifications and
 * customer_notifications. One source of truth: the Edge Function that sends the push (supabase/proposals/functions/
 * notify-push) uses a generated copy of this file (npm run push:build) so the apps and the server never disagree.
 *
 * Wording is written here, not taken from the database, because several old database triggers use wrong or noisy text
 * (for example the customer notification for "job started" says "Your Pro Has Arrived!").
 */
export type PushAudience = "customer" | "provider";

export type PushNotificationRow = {
  id?: string | null;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  booking_id?: string | null;
  data?: Record<string, unknown> | null;
};

export type PushMessage = {
  title: string;
  body: string;
  /** Opens the right screen when tapped. */
  data: { kind: string; audience: PushAudience; bookingId?: string };
  /** Android channel. "requests" is the loud one the Pro app creates; "updates" is the quiet normal one. */
  channelId: "requests" | "updates";
  /** Custom ring for new requests only (the file ships inside the Pro app). */
  sound: "new_request.wav" | "default";
  priority: "high" | "default";
};

const MAX_BODY = 140;

/** Single line, no control characters, at most 140 characters (…). Never returns undefined. */
export function cleanText(text: unknown, fallback: string): string {
  const raw = typeof text === "string" ? text : "";
  const one = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  const t = one || fallback;
  return t.length > MAX_BODY ? `${t.slice(0, MAX_BODY - 1).trimEnd()}…` : t;
}

const isUuidLike = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{8,64}$/i.test(v);

export function bookingIdOf(row: PushNotificationRow): string | undefined {
  if (isUuidLike(row.booking_id)) return row.booking_id;
  const fromData = row.data?.["booking_id"] ?? row.data?.["bookingId"];
  return isUuidLike(fromData) ? fromData : undefined;
}

type Spec = { kind: string; title: string; body: string; loud?: boolean; useRowBody?: boolean };

const PROVIDER: Record<string, Spec> = {
  new_booking: { kind: "new_request", title: "New job request", body: "Open HandyFix Pro to see the details, then accept or decline.", loud: true },
  booking_cancelled: { kind: "booking_cancelled", title: "Booking cancelled", body: "A customer cancelled a booking. Nothing was charged." },
  new_review: { kind: "new_review", title: "New review", body: "A customer reviewed your work." },
  kyc_approved: { kind: "kyc_approved", title: "You are approved", body: "Your identity check passed. Go online to start getting requests." },
  kyc_rejected: { kind: "kyc_rejected", title: "Your application needs a fix", body: "Open HandyFix Pro to see what to change." },
};

const CUSTOMER: Record<string, Spec> = {
  booking_confirmed: { kind: "booking_confirmed", title: "Your pro accepted", body: "Your booking is confirmed. Open HandyFix to follow it." },
  provider_on_the_way: { kind: "on_the_way", title: "Your pro is on the way", body: "Open HandyFix to follow them live." },
  job_started: { kind: "job_started", title: "Your pro started the job", body: "Approve any extra work in the app. Share your code only when the work is done." },
  job_completed: { kind: "job_completed", title: "Job completed", body: "How did it go? Rate your pro in the app." },
  booking_cancelled: { kind: "booking_cancelled", title: "Booking cancelled", body: "Open HandyFix to book again or pick another pro." },
  new_message: { kind: "new_message", title: "New message", body: "Your pro sent you a message.", useRowBody: true },
};

/**
 * The push for one notification row, or null when it should not be pushed (unknown or purely informational types).
 * A chat message uses the message text (shortened); everything else uses the fixed wording above.
 */
export function pushMessageFor(audience: PushAudience, row: PushNotificationRow): PushMessage | null {
  const type = typeof row.type === "string" ? row.type : "";
  const spec = (audience === "provider" ? PROVIDER : CUSTOMER)[type];
  if (!spec) return null;
  const bookingId = bookingIdOf(row);
  return {
    title: spec.title,
    body: spec.useRowBody ? cleanText(row.message, spec.body) : spec.body,
    data: { kind: spec.kind, audience, ...(bookingId ? { bookingId } : {}) },
    channelId: spec.loud ? "requests" : "updates",
    sound: spec.loud ? "new_request.wav" : "default",
    priority: spec.loud ? "high" : "default",
  };
}

/**
 * The same event can be written several times (the live database has more than one trigger per booking event: 161
 * new-booking rows for 61 bookings). The server records this key once; a repeat is skipped, so a pro gets one alert
 * per request, not three.
 */
export function dedupeKey(audience: PushAudience, recipientId: string, row: PushNotificationRow): string {
  const subject = bookingIdOf(row) ?? (typeof row.id === "string" ? row.id : "none");
  return `${audience}:${recipientId}:${typeof row.type === "string" ? row.type : "unknown"}:${subject}`;
}

/** Expo push tokens look like ExponentPushToken[xxxx] (or ExpoPushToken[xxxx]). */
export const isExpoPushToken = (v: unknown): v is string => typeof v === "string" && /^Expo(nent)?PushToken\[[^\]\s]{10,}\]$/.test(v);

/** Which screen a tapped notification opens. Null = just open the app. */
export function pushTarget(data: unknown): { audience: PushAudience; bookingId: string } | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  const audience = d["audience"];
  if ((audience !== "customer" && audience !== "provider") || !isUuidLike(d["bookingId"])) return null;
  return { audience, bookingId: d["bookingId"] };
}
