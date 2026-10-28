import { unreadCount } from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSession } from "@/features/auth/session-provider";
import { getSupabase } from "@/lib/supabase";
import { fetchNotifications, notificationsKey, type NotifRole } from "./api";

const TABLE = { customer: ["customer_notifications", "user_id"], provider: ["provider_notifications", "provider_id"] } as const;

/** The signed-in person's id for this role: auth user id for a customer, provider row id for a pro. */
export function useNotifOwner(role: NotifRole): string | null {
  const { userId, provider } = useSession();
  return role === "customer" ? userId : (provider?.id ?? null);
}

/** New rows arrive through Realtime; the 30 s poll is the safety net. */
export function useNotifications(role: NotifRole) {
  const ownerId = useNotifOwner(role);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: notificationsKey(role, ownerId ?? ""), enabled: !!ownerId, queryFn: () => fetchNotifications(role, ownerId!), refetchInterval: 30_000,
  });
  useEffect(() => {
    if (!ownerId) return;
    const supabase = getSupabase();
    const [table, column] = TABLE[role];
    const channel = supabase
      // A unique name per subscription: the bell and the list can be on screen together, and one name cannot be joined twice.
      .channel(`notifs-${role}-${ownerId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `${column}=eq.${ownerId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: notificationsKey(role, ownerId) });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [role, ownerId, queryClient]);
  return { ...query, ownerId, unread: unreadCount(query.data ?? []) };
}
