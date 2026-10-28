import { friendlyAuthError, validateMessage, type ChatRole } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";

export type ChatMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_type: ChatRole;
  content: string;
  is_read: boolean;
  created_at: string;
};

export const chatKey = (bookingId: string) => ["chat", bookingId] as const;
export const unreadKey = (bookingId: string, role: ChatRole) => ["chat-unread", bookingId, role] as const;

export async function fetchMessages(bookingId: string): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from("messages").select("id, booking_id, sender_id, sender_type, content, is_read, created_at")
    .eq("booking_id", bookingId).order("created_at", { ascending: true }).limit(500);
  if (error) throw new Error(friendlyAuthError(error.message));
  return (data ?? []) as ChatMessage[];
}

/** Phone numbers are refused here too, so no screen can skip the check. */
export async function sendMessage(args: { bookingId: string; userId: string; role: ChatRole; text: string }): Promise<void> {
  const check = validateMessage(args.text);
  if (!check.ok) throw new Error(check.error);
  const { error } = await getSupabase().from("messages").insert({
    booking_id: args.bookingId, sender_id: args.userId, sender_type: args.role, content: check.text,
  });
  if (error) {
    // Row-level security refuses a message once the job is over or the sender is not part of the booking.
    // Rules written for people by the database (22023): chat closed, phone number, too long.
    if (error.code === "22023" && error.message) throw new Error(error.message);
    if (error.code === "42501" || /row-level security/i.test(error.message)) throw new Error("This chat is closed.");
    throw new Error(/network request failed|failed to fetch/i.test(error.message) ? "No internet connection. Your message was not sent." : "Your message could not be sent. Please try again.");
  }
}

/** Marks the other side's messages as read. Best effort. */
export async function markRead(bookingId: string, me: ChatRole): Promise<void> {
  await getSupabase().from("messages").update({ is_read: true }).eq("booking_id", bookingId).neq("sender_type", me).eq("is_read", false);
}

export async function fetchUnread(bookingId: string, me: ChatRole): Promise<number> {
  const { count, error } = await getSupabase()
    .from("messages").select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId).neq("sender_type", me).eq("is_read", false);
  if (error) return 0;
  return count ?? 0;
}
