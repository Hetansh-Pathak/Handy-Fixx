import { PHONE_BLOCK_MESSAGE, containsPhoneNumber } from "./phone-block";

export const MAX_MESSAGE_LENGTH = 1000;

export type ChatRole = "customer" | "provider";

const OPEN_STATUSES = ["confirmed", "on_the_way", "arrived", "in_progress"];

/** Chat opens when a pro accepts (PDF p.4: "Chat, masked calling once confirmed") and closes when the job ends. */
export const canSendChat = (status: string): boolean => OPEN_STATUSES.includes(status);

/** After the job the conversation stays readable (it is dispute evidence) but nobody can add to it. */
export function chatAvailable(status: string, hasMessages: boolean): "open" | "read_only" | "hidden" {
  if (canSendChat(status)) return "open";
  return hasMessages && (status === "completed" || status === "cancelled") ? "read_only" : "hidden";
}

export type MessageCheck = { ok: true; text: string } | { ok: false; error: string };

export function validateMessage(raw: string): MessageCheck {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Keep each message under ${MAX_MESSAGE_LENGTH} characters.` };
  if (containsPhoneNumber(text)) return { ok: false, error: PHONE_BLOCK_MESSAGE };
  return { ok: true, text };
}

export const countUnread = (rows: readonly { sender_type: string; is_read: boolean }[], me: ChatRole): number =>
  rows.filter((r) => r.sender_type !== me && !r.is_read).length;

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "am" : "pm"}`;
}
