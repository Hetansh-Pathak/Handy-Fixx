import { friendlyAuthError, type NotificationRow } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";

export type NotifRole = "customer" | "provider";

/** Customers are keyed by their auth user id; pros by their provider row id. */
const SOURCE = {
  customer: { table: "customer_notifications", column: "user_id" },
  provider: { table: "provider_notifications", column: "provider_id" },
} as const;

const COLUMNS = "id, type, title, message, booking_id, is_read, data, created_at";

export const notificationsKey = (role: NotifRole, ownerId: string) => ["notifications", role, ownerId] as const;

export async function fetchNotifications(role: NotifRole, ownerId: string): Promise<NotificationRow[]> {
  const s = SOURCE[role];
  const { data, error } = await getSupabase().from(s.table).select(COLUMNS).eq(s.column, ownerId).order("created_at", { ascending: false }).limit(60);
  if (error) throw new Error(friendlyAuthError(error.message));
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationRead(role: NotifRole, id: string): Promise<void> {
  await getSupabase().from(SOURCE[role].table).update({ is_read: true }).eq("id", id);
}

export async function markAllNotificationsRead(role: NotifRole, ownerId: string): Promise<void> {
  const s = SOURCE[role];
  const { error } = await getSupabase().from(s.table).update({ is_read: true }).eq(s.column, ownerId).eq("is_read", false);
  if (error) throw new Error("Could not mark them as read. Please try again.");
}
