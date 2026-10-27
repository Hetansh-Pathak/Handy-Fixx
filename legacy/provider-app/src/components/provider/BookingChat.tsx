import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const sb = supabase as any; // messages table not yet in generated types

interface Message {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_type: "customer" | "provider";
  content: string;
  is_read: boolean;
  created_at: string;
}

interface BookingChatProps {
  bookingId: string;
  currentUserId: string;
  senderType: "customer" | "provider";
}

const BookingChat = ({ bookingId, currentUserId, senderType }: BookingChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    sb
      .from("messages")
      .select("*")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true })
      .then(({ data }: any) => {
        if (data) setMessages(data as Message[]);
        setTimeout(scrollToBottom, 100);
      });

    sb
      .from("messages")
      .update({ is_read: true })
      .eq("booking_id", bookingId)
      .neq("sender_type", senderType);

    sb
      .from("bookings")
      .update({ unread_messages_provider: 0 })
      .eq("id", bookingId);

    const channel = supabase
      .channel(`provider-chat-${bookingId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `booking_id=eq.${bookingId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
          setTimeout(scrollToBottom, 50);
          if (newMsg.sender_type !== senderType) {
            sb.from("messages").update({ is_read: true }).eq("id", newMsg.id);
            sb
              .from("bookings")
              .update({ unread_messages_provider: 0 })
              .eq("id", bookingId);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [bookingId, senderType]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const content = input.trim();
    setInput("");
    await sb.from("messages").insert({
      booking_id: bookingId,
      sender_id: currentUserId,
      sender_type: senderType,
      content,
    });
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[380px] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageCircle className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No messages yet. Say hello!</p>
          </div>
        )}
        <AnimatePresence>
          {messages.map((msg) => {
            const isOwn = msg.sender_type === senderType;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn("flex", isOwn ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm",
                    isOwn
                      ? "gold-gradient text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm"
                  )}
                >
                  <p>{msg.content}</p>
                  <p className="text-[10px] opacity-60 mt-1 text-right">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground outline-none border border-border focus:border-primary transition-colors"
        />
        <Button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          size="sm"
          className="gold-gradient text-primary-foreground rounded-xl px-4 h-10"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default BookingChat;
