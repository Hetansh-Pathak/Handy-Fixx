/** Rows of `customer_notifications` and `provider_notifications`, as the app reads them. */
export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  booking_id: string | null;
  is_read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
};

export type NotificationKind = "booking" | "done" | "cancelled" | "message" | "review" | "identity" | "money" | "dispute" | "info";

export function notificationKind(type: string): NotificationKind {
  switch (type) {
    case "new_booking": case "booking_confirmed": case "provider_on_the_way": case "provider_arrived": case "job_started":
      return "booking";
    case "job_completed": return "done";
    case "booking_cancelled": return "cancelled";
    case "new_message": return "message";
    case "new_review": return "review";
    case "kyc_submitted": case "kyc_approved": case "kyc_rejected": return "identity";
    case "payment": case "wallet": case "payout": return "money";
    default:
      return type.startsWith("dispute") ? "dispute" : "info";
  }
}

const PLAIN_ID = /^[0-9a-zA-Z-]{1,64}$/; // a uuid or similar: no slashes or dots that could change the route

/** Where a tap on a notification goes, or null when it is only information. */
export function notificationTarget(n: NotificationRow, role: "customer" | "provider"): string | null {
  const fromData = typeof n.data?.booking_id === "string" ? n.data.booking_id : null;
  const bookingId = n.booking_id ?? fromData;
  if (bookingId && PLAIN_ID.test(bookingId)) return role === "customer" ? `/customer/booking/${bookingId}` : `/provider/job/${bookingId}`;
  if (role === "provider") {
    if (notificationKind(n.type) === "identity") return "/provider/kyc";
    if (n.type === "new_review") return "/provider/reviews";
  }
  return null;
}

export const unreadCount = (rows: readonly { is_read: boolean }[]): number => rows.filter((r) => !r.is_read).length;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function relativeTime(iso: string, now: Date): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "";
  const seconds = (now.getTime() - t.getTime()) / 1000;
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400 && t.getUTCDate() === now.getUTCDate()) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 2 * 86_400) return "Yesterday";
  return `${t.getDate()} ${MONTHS[t.getMonth()]}`;
}
