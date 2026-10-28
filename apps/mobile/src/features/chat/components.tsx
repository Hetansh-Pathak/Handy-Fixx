import { chatAvailable, formatMessageTime, validateMessage, type ChatRole } from "@handyfix/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MessageCircle, Send } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/text";
import { Body, ErrorBanner, ScreenHeader, ListSkeleton } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { colors } from "@/theme/colors";
import { chatKey, markRead, sendMessage, unreadKey } from "./api";
import { useChat, useUnread } from "./use-chat";

/** "Message Rajesh" with a badge for unread messages. Shown only while chat is open or has history. */
export function ChatButton({ bookingId, role, status, otherName }: { bookingId: string; role: ChatRole; status: string; otherName: string }) {
  const router = useRouter();
  const history = useChat(bookingId, status === "completed" || status === "cancelled");
  const mode = chatAvailable(status, (history.data?.length ?? 0) > 0);
  const unread = useUnread(bookingId, role, mode !== "hidden");
  if (mode === "hidden") return null;
  const count = unread.data ?? 0;
  const go = () => router.push(`/${role}/chat/${bookingId}`);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${mode === "open" ? "Message" : "Read chat with"} ${otherName}${count ? `, ${count} unread` : ""}`}
      onPress={go} className="min-h-[52px] flex-row items-center justify-center gap-2 rounded-xl border border-line bg-card px-5 active:opacity-80">
      <MessageCircle size={20} color={colors.brand} />
      <Text className="text-base font-semibold text-fg">{mode === "open" ? `Message ${otherName}` : "Read chat"}</Text>
      {count > 0 ? <View className="min-w-[22px] items-center rounded-full bg-brand px-1.5 py-0.5"><Text className="text-xs font-bold text-white">{count}</Text></View> : null}
    </Pressable>
  );
}

/** The full-screen conversation for one booking. */
export function ChatScreen({ bookingId, role, status, otherName, onBack }: {
  bookingId: string; role: ChatRole; status: string; otherName: string; onBack: () => void;
}) {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const chat = useChat(bookingId);
  const messages = chat.data ?? [];
  const mode = chatAvailable(status, messages.length > 0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);
  const unreadFromOther = messages.filter((m) => m.sender_type !== role && !m.is_read).length;

  // Reading the chat marks the other side's messages as read.
  useEffect(() => {
    if (unreadFromOther === 0) return;
    void markRead(bookingId, role).then(() => queryClient.invalidateQueries({ queryKey: unreadKey(bookingId, role) }));
  }, [bookingId, role, unreadFromOther, queryClient]);

  useEffect(() => { const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60); return () => clearTimeout(t); }, [messages.length]);

  const send = async () => {
    if (!userId || sending) return;
    const check = validateMessage(draft);
    if (!check.ok) { setError(check.error); return; }
    setSending(true);
    setError(null);
    try {
      await sendMessage({ bookingId, userId, role, text: check.text });
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: chatKey(bookingId) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="px-5 pt-3"><ScreenHeader title={`Chat with ${otherName}`} onBack={onBack} /></View>
        <ScrollView ref={scroller} className="flex-1" contentContainerStyle={{ padding: 20, gap: 10, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {chat.isPending ? <ListSkeleton rows={2} /> : null}
          {chat.isError ? <ErrorBanner message="Could not load the chat. Check your internet." /> : null}
          {chat.isSuccess && messages.length === 0 ? (
            <View className="flex-1 items-center justify-center gap-2 py-16">
              <MessageCircle size={40} color={colors.mutedSoft} />
              <Text className="text-center text-base text-muted">No messages yet. Say hello and share anything useful about the job.</Text>
            </View>
          ) : null}
          {messages.map((m) => {
            const own = m.sender_type === role;
            return (
              <View key={m.id} className={own ? "items-end" : "items-start"}>
                <View className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${own ? "rounded-br-md bg-brand" : "rounded-bl-md border border-line bg-card"}`}>
                  <Text className={`text-base ${own ? "text-white" : "text-fg"}`}>{m.content}</Text>
                  <Text className={`mt-1 text-right text-[11px] ${own ? "text-white/80" : "text-muted"}`}>{formatMessageTime(m.created_at)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View className="gap-2 border-t border-line bg-canvas px-4 py-3">
          <ErrorBanner message={error} />
          {mode === "open" ? (
            <>
              <View className="flex-row items-end gap-2">
                <TextInput
                  accessibilityLabel="Message" value={draft} onChangeText={(t) => { setDraft(t); setError(null); }} multiline maxLength={1000}
                  placeholder="Type a message" placeholderTextColor={colors.mutedSoft} style={{ fontFamily: "PlusJakartaSans_400Regular", maxHeight: 120 }}
                  className="min-h-[48px] flex-1 rounded-2xl border border-line bg-field px-4 py-3 text-base text-fg"
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={sending || !draft.trim()} onPress={() => void send()}
                  className={`h-12 w-12 items-center justify-center rounded-full bg-brand ${sending || !draft.trim() ? "opacity-40" : "active:opacity-80"}`}>
                  <Send size={20} color={colors.white} />
                </Pressable>
              </View>
              <Text className="text-xs text-muted">Phone numbers cannot be shared here. Use the Call button on the booking.</Text>
            </>
          ) : (
            <Text className="text-center text-sm text-muted">This job has ended, so the chat is closed. You can still read it.</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
