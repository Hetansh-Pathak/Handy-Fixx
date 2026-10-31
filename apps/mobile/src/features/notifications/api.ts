import { friendlyAuthError, type NotificationRow } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";

export type NotifRole = "customer" | "provider";

/** Customers are keyed by their auth user id; pros by their provider row id. */
const SOURCE = {
  customer: { table: "customer_notifications", column: "user_id" },
  provider: { table: "provider_notifications", column: "provider_id" },
} as const;

const BASE_COLUMNS = "id, type, title, message, is_read, data, created_at";
const COLUMNS = `${BASE_COLUMNS}, booking_id`;

export const notificationsKey = (role: NotifRole, ownerId: string) => ["notifications", role, ownerId] as const;

export async function fetchNotifications(role: NotifRole, ownerId: string): Promise<NotificationRow[]> {
  const s = SOURCE[role];
  const read = (columns: string) =>
    getSupabase().from(s.table).select(columns).eq(s.column, ownerId).order("created_at", { ascending: false }).limit(60);
  let { data, error } = await read(COLUMNS);
  // `provider_notifications` has no booking_id column on the live database: read without it. The booking is still found
  // from `data.booking_id` (see notificationTarget), so a tap opens the same job.
  if (error && (error.code === "42703" || /booking_id/.test(error.message) || error.code === "PGRST204")) {
    ({ data, error } = await read(BASE_COLUMNS));
    if (!error) return ((data ?? []) as unknown as Omit<NotificationRow, "booking_id">[]).map((r) => ({ ...r, booking_id: null }));
  }
  if (error) throw new Error(friendlyAuthError(error.message));
  return (data ?? []) as unknown as NotificationRow[];
}

export async function markNotificationRead(role: NotifRole, id: string): Promise<void> {
  await getSupabase().from(SOURCE[role].table).update({ is_read: true }).eq("id", id);
}

export async function markAllNotificationsRead(role: NotifRole, ownerId: string): Promise<void> {
  const s = SOURCE[role];
  const { error } = await getSupabase().from(s.table).update({ is_read: true }).eq(s.column, ownerId).eq("is_read", false);
  if (error) throw new Error("Could not mark them as read. Please try again.");
}
