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
  const now = new Date("2026-11-05T12:00:00Z");
  it("says just now, minutes, hours, yesterday, then the date", () => {
    expect(relativeTime("2026-11-05T11:59:40Z", now)).toBe("Just now");
    expect(relativeTime("2026-11-05T11:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-11-05T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-11-04T10:00:00Z", now)).toBe("Yesterday");
    expect(relativeTime("2026-10-20T10:00:00Z", now)).toMatch(/20 Oct/);
  });
  it("copes with a bad date and a time slightly in the future", () => {
    expect(relativeTime("nope", now)).toBe("");
    expect(relativeTime("2026-11-05T12:00:30Z", now)).toBe("Just now");
  });
});
