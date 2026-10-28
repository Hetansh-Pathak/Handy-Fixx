import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, canSendChat, chatAvailable, countUnread, formatMessageTime, validateMessage } from "./chat";
import { PHONE_BLOCK_MESSAGE } from "./phone-block";

describe("canSendChat", () => {
  it("opens once a pro has accepted and closes when the job ends", () => {
    for (const s of ["confirmed", "on_the_way", "arrived", "in_progress"]) expect(canSendChat(s)).toBe(true);
    for (const s of ["pending", "completed", "cancelled"]) expect(canSendChat(s)).toBe(false);
  });
});

describe("chatAvailable", () => {
  it("shows an old conversation read-only after the job, if there was one", () => {
    expect(chatAvailable("completed", true)).toBe("read_only");
    expect(chatAvailable("cancelled", true)).toBe("read_only");
    expect(chatAvailable("completed", false)).toBe("hidden");
    expect(chatAvailable("pending", true)).toBe("hidden");
    expect(chatAvailable("confirmed", false)).toBe("open");
  });
});

describe("validateMessage", () => {
  it("trims and accepts normal text", () => {
    expect(validateMessage("  On my way  ")).toEqual({ ok: true, text: "On my way" });
  });
  it("rejects empty text", () => {
    expect(validateMessage("   ")).toEqual({ ok: false, error: "Type a message first." });
  });
  it("rejects very long text", () => {
    const r = validateMessage("x".repeat(MAX_MESSAGE_LENGTH + 1));
    expect(r.ok).toBe(false);
  });
  it("blocks phone numbers with the explanation", () => {
    expect(validateMessage("call 98765 43210")).toEqual({ ok: false, error: PHONE_BLOCK_MESSAGE });
  });
});

describe("countUnread", () => {
  const rows = [
    { sender_type: "provider", is_read: false },
    { sender_type: "provider", is_read: true },
    { sender_type: "customer", is_read: false },
    { sender_type: "provider", is_read: false },
  ];
  it("counts only the other side's unread messages", () => {
    expect(countUnread(rows, "customer")).toBe(2);
    expect(countUnread(rows, "provider")).toBe(1);
  });
});

describe("formatMessageTime", () => {
  it("shows the clock time", () => {
    expect(formatMessageTime(new Date(2026, 10, 5, 15, 5).toISOString())).toBe("3:05 pm");
    expect(formatMessageTime(new Date(2026, 10, 5, 0, 7).toISOString())).toBe("12:07 am");
    expect(formatMessageTime(new Date(2026, 10, 5, 12, 0).toISOString())).toBe("12:00 pm");
  });
  it("is empty for a bad date", () => expect(formatMessageTime("nope")).toBe(""));
});
