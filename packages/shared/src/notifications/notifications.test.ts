import { describe, expect, it } from "vitest";
import { notificationKind, notificationTarget, relativeTime, unreadCount, type NotificationRow } from "./notifications";

const row = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: "n1", type: "booking_confirmed", title: "T", message: "M", booking_id: null, is_read: false, data: null, created_at: "2026-11-05T10:00:00Z", ...over,
});

describe("notificationKind", () => {
  it("groups the stored types for an icon and colour", () => {
    expect(notificationKind("new_booking")).toBe("booking");
    expect(notificationKind("booking_confirmed")).toBe("booking");
    expect(notificationKind("provider_on_the_way")).toBe("booking");
    expect(notificationKind("job_started")).toBe("booking");
    expect(notificationKind("job_completed")).toBe("done");
    expect(notificationKind("booking_cancelled")).toBe("cancelled");
    expect(notificationKind("new_message")).toBe("message");
    expect(notificationKind("new_review")).toBe("review");
    expect(notificationKind("kyc_approved")).toBe("identity");
    expect(notificationKind("kyc_rejected")).toBe("identity");
    expect(notificationKind("payment")).toBe("money");
    expect(notificationKind("dispute_opened")).toBe("dispute");
    expect(notificationKind("system")).toBe("info");
    expect(notificationKind("something_new")).toBe("info");
  });
});

describe("notificationTarget", () => {
  it("opens the booking for a customer", () => {
    expect(notificationTarget(row({ booking_id: "b1" }), "customer")).toBe("/customer/booking/b1");
  });
  it("opens the job for a pro", () => {
    expect(notificationTarget(row({ booking_id: "b1", type: "new_booking" }), "provider")).toBe("/provider/job/b1");
  });
  it("finds the booking in the data when the column is empty", () => {
    expect(notificationTarget(row({ data: { booking_id: "b2" } }), "customer")).toBe("/customer/booking/b2");
  });
  it("sends identity news to the identity page", () => {
    expect(notificationTarget(row({ type: "kyc_rejected" }), "provider")).toBe("/provider/kyc");
    expect(notificationTarget(row({ type: "kyc_approved" }), "provider")).toBe("/provider/kyc");
  });
  it("sends review news to the pro's reviews", () => {
    expect(notificationTarget(row({ type: "new_review" }), "provider")).toBe("/provider/reviews");
  });
  it("is null when there is nowhere to go, or the id is not a plain id", () => {
    expect(notificationTarget(row({ type: "system" }), "customer")).toBeNull();
    expect(notificationTarget(row({ booking_id: "../../etc" }), "customer")).toBeNull();
  });
});

describe("unreadCount", () => {
  it("counts unread rows", () => {
    expect(unreadCount([row(), row({ is_read: true }), row({ id: "n3" })])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});

describe("relativeTime", () => {
  // Local-time dates, so the result does not depend on the machine's time zone.
  const now = new Date(2026, 10, 5, 15, 0);
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
  it("says just now, minutes, hours, yesterday, then the date", () => {
    expect(relativeTime(new Date(2026, 10, 5, 14, 59, 40).toISOString(), now)).toBe("Just now");
    expect(relativeTime(at(5, 14, 55), now)).toBe("5 min ago");
    expect(relativeTime(at(5, 9), now)).toBe("6 h ago");
    expect(relativeTime(at(4, 10), now)).toBe("Yesterday");
    expect(relativeTime(new Date(2026, 9, 20, 10).toISOString(), now)).toMatch(/20 Oct/);
  });
  it("uses the local calendar day, so 11 PM last night is Yesterday at 2 AM", () => {
    const early = new Date(2026, 10, 5, 2, 0);
    expect(relativeTime(at(4, 23), early)).toBe("Yesterday");
    expect(relativeTime(at(5, 0, 30), early)).toBe("1 h ago");
  });
  it("copes with a bad date and a time slightly in the future", () => {
    expect(relativeTime("nope", now)).toBe("");
    expect(relativeTime(new Date(2026, 10, 5, 15, 0, 30).toISOString(), now)).toBe("Just now");
  });
});
