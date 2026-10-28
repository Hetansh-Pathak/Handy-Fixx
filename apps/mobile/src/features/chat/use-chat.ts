import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ChatRole } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";
import { chatKey, fetchMessages, fetchUnread, unreadKey } from "./api";

/**
 * One booking's conversation. Realtime delivers a message at once; the 8 s poll is the safety net because a
 * phone connection can drop a Realtime channel without telling the app.
 */
export function useChat(bookingId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: chatKey(bookingId ?? ""), enabled: !!bookingId && enabled, queryFn: () => fetchMessages(bookingId!), refetchInterval: 8_000,
  });
  useEffect(() => {
    if (!bookingId || !enabled) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`chat-${bookingId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `booking_id=eq.${bookingId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: chatKey(bookingId) });
        void queryClient.invalidateQueries({ queryKey: ["chat-unread", bookingId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId, enabled, queryClient]);
  return query;
}

/** How many messages from the other side are waiting (for the badge on the chat button). */
export function useUnread(bookingId: string | undefined, me: ChatRole, enabled = true) {
  return useQuery({
    queryKey: unreadKey(bookingId ?? "", me), enabled: !!bookingId && enabled, queryFn: () => fetchUnread(bookingId!, me), refetchInterval: 10_000,
  });
}
