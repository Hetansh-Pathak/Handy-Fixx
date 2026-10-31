import { describe, expect, it } from "vitest";
import { bookingIdOf, cleanText, dedupeKey, isExpoPushToken, pushMessageFor, pushTarget } from "./messages";

const B = "7f3c1a52-1111-4222-8333-abcdefabcdef";

describe("pushMessageFor (pro)", () => {
  it("a new request is the loud one, with the booking to open", () => {
    const m = pushMessageFor("provider", { type: "new_booking", booking_id: B, title: "New Booking Request 📋" });
    expect(m).toEqual({
      title: "New job request", body: "Open apnabanda Pro to see the details, then accept or decline.",
      data: { kind: "new_request", audience: "provider", bookingId: B }, channelId: "requests", sound: "new_request.wav", priority: "high",
    });
  });
  it("finds the booking in data too, for the pro table", () => {
    expect(pushMessageFor("provider", { type: "new_booking", data: { booking_id: B } })?.data.bookingId).toBe(B);
    expect(pushMessageFor("provider", { type: "new_booking", data: { bookingId: B } })?.data.bookingId).toBe(B);
  });
  it("other events are quiet", () => {
    for (const type of ["booking_cancelled", "new_review", "kyc_approved", "kyc_rejected"]) {
      const m = pushMessageFor("provider", { type })!;
      expect(m.channelId).toBe("updates");
      expect(m.sound).toBe("default");
      expect(m.priority).toBe("default");
    }
  });
  it("does not push things nobody needs a phone alert for", () => {
    for (const type of ["kyc_submitted", "something_new", "", undefined, null]) expect(pushMessageFor("provider", { type })).toBeNull();
  });
});

describe("pushMessageFor (customer)", () => {
  it("uses correct wording: the job STARTED, not 'arrived' as the old database trigger says", () => {
    const m = pushMessageFor("customer", { type: "job_started", booking_id: B, title: "🚀 Your Pro Has Arrived!" })!;
    expect(m.title).toBe("Your pro started the job");
    expect(JSON.stringify(m)).not.toMatch(/Arrived/);
    expect(m.data).toEqual({ kind: "job_started", audience: "customer", bookingId: B });
  });
  it("covers the booking life and none of it is loud", () => {
    for (const type of ["booking_confirmed", "provider_on_the_way", "job_completed", "booking_cancelled", "new_message"]) {
      const m = pushMessageFor("customer", { type, booking_id: B, message: "hello" })!;
      expect(m).not.toBeNull();
      expect(m.channelId).toBe("updates");
    }
  });
  it("a chat message shows its text, shortened and on one line, with a fallback when empty", () => {
    expect(pushMessageFor("customer", { type: "new_message", message: "On my way\nsee you soon" })!.body).toBe("On my way see you soon");
    expect(pushMessageFor("customer", { type: "new_message", message: "x".repeat(500) })!.body.length).toBe(140);
    expect(pushMessageFor("customer", { type: "new_message", message: "   " })!.body).toBe("Your pro sent you a message.");
    expect(pushMessageFor("customer", { type: "new_message" })!.body).toBe("Your pro sent you a message.");
  });
  it("never mixes the two audiences' types", () => {
    expect(pushMessageFor("customer", { type: "new_booking" })).toBeNull();
    expect(pushMessageFor("provider", { type: "booking_confirmed" })).toBeNull();
  });
});

describe("dedupeKey", () => {
  it("is the same for repeated rows of one event and different across events, people and audiences", () => {
    const a = dedupeKey("provider", "p1", { id: "r1", type: "new_booking", booking_id: B });
    expect(dedupeKey("provider", "p1", { id: "r2", type: "new_booking", booking_id: B })).toBe(a);
    expect(dedupeKey("provider", "p1", { id: "r1", type: "booking_cancelled", booking_id: B })).not.toBe(a);
    expect(dedupeKey("provider", "p2", { id: "r1", type: "new_booking", booking_id: B })).not.toBe(a);
    expect(dedupeKey("customer", "p1", { id: "r1", type: "new_booking", booking_id: B })).not.toBe(a);
  });
  it("falls back to the row id when there is no booking, and copes with a bare row", () => {
    expect(dedupeKey("provider", "p1", { id: "r9", type: "new_review" })).toBe("provider:p1:new_review:r9");
    expect(dedupeKey("provider", "p1", {})).toBe("provider:p1:unknown:none");
  });
});

describe("small helpers", () => {
  it("cleanText flattens whitespace and control characters", () => {
    expect(cleanText("a\u0000b\n\n c\t d", "x")).toBe("a b c d");
    expect(cleanText(42, "fallback")).toBe("fallback");
  });
  it("bookingIdOf only accepts id-looking values", () => {
    expect(bookingIdOf({ booking_id: "'; drop table" })).toBeUndefined();
    expect(bookingIdOf({ data: { booking_id: 7 } })).toBeUndefined();
  });
  it("isExpoPushToken accepts the Expo shapes only", () => {
    expect(isExpoPushToken("ExponentPushToken[abcdefghij1234567890]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abcdefghij1234567890]")).toBe(true);
    for (const v of ["", "abc", "ExponentPushToken[]", "ExponentPushToken[short]", null, 5, "fcm:APA91b..."]) expect(isExpoPushToken(v)).toBe(false);
  });
  it("pushTarget tells the app which screen to open", () => {
    expect(pushTarget({ audience: "customer", bookingId: B })).toEqual({ audience: "customer", bookingId: B });
    for (const v of [null, undefined, "x", {}, { audience: "admin", bookingId: B }, { audience: "customer" }, { audience: "customer", bookingId: "../x" }]) expect(pushTarget(v)).toBeNull();
  });
});
