import { describe, it, expect } from "vitest";
import { defaultTab, groupBookings, liveLine, mergeRealtime, toBookingItem, type BookingRow } from "@/lib/bookings";

const row = (over: Partial<BookingRow> & { id: string }): BookingRow => ({ status: "pending", created_at: "2026-10-01T10:00:00Z", ...over });
const item = (r: BookingRow, ratings = new Map<string, number>()) => toBookingItem(r, ratings);

describe("toBookingItem", () => {
  it("fills friendly fallbacks", () => {
    const i = item(row({ id: "a", status: null }));
    expect(i.status).toBe("pending");
    expect(i.serviceName).toBe("Home service");
    expect(i.providerName).toBe("Your pro");
    expect(i.place).toBe("");
  });
  it("prefers scheduled_* over booking_* and joins the place", () => {
    const i = item(row({ id: "a", scheduled_date: "2026-10-08", booking_date: "2026-10-01", address: "12 MG Road", city: "Rajkot" }));
    expect(i.scheduledDate).toBe("2026-10-08");
    expect(i.place).toBe("12 MG Road, Rajkot");
  });
  it("attaches an existing rating", () => {
    expect(item(row({ id: "a" }), new Map([["a", 4]])).rating).toBe(4);
    expect(item(row({ id: "b" }), new Map([["a", 4]])).rating).toBe(null);
  });
});

describe("groupBookings", () => {
  const items = [
    item(row({ id: "late", status: "confirmed", scheduled_date: "2026-10-09", scheduled_time: "10:00" })),
    item(row({ id: "soon", status: "pending", scheduled_date: "2026-10-06", scheduled_time: "09:00" })),
    item(row({ id: "live", status: "on_the_way", scheduled_date: "2026-10-12" })),
    item(row({ id: "done1", status: "completed", scheduled_date: "2026-09-01" })),
    item(row({ id: "done2", status: "completed", scheduled_date: "2026-09-20" })),
    item(row({ id: "gone", status: "cancelled", scheduled_date: "2026-09-10" })),
  ];
  const g = groupBookings(items);

  it("puts live jobs first, then upcoming by date", () => {
    expect(g.upcoming.map((i) => i.id)).toEqual(["live", "soon", "late"]);
  });
  it("lists history newest first", () => {
    expect(g.completed.map((i) => i.id)).toEqual(["done2", "done1"]);
    expect(g.cancelled.map((i) => i.id)).toEqual(["gone"]);
  });
  it("opens on the most useful tab", () => {
    expect(defaultTab(g)).toBe("upcoming");
    expect(defaultTab({ upcoming: [], completed: g.completed, cancelled: [] })).toBe("completed");
    expect(defaultTab({ upcoming: [], completed: [], cancelled: g.cancelled })).toBe("cancelled");
    expect(defaultTab({ upcoming: [], completed: [], cancelled: [] })).toBe("upcoming");
  });
});

describe("mergeRealtime", () => {
  const base = [item(row({ id: "a", status: "confirmed", provider_eta_minutes: 20 })), item(row({ id: "b" }))];
  it("updates only the matching booking", () => {
    const next = mergeRealtime(base, { id: "a", status: "on_the_way", provider_eta_minutes: 0 });
    expect(next[0].status).toBe("on_the_way");
    expect(next[0].etaMinutes).toBe(0);
    expect(next[1]).toBe(base[1]);
  });
  it("keeps the old ETA when the update doesn't mention it", () => {
    expect(mergeRealtime(base, { id: "a", status: "in_progress" })[0].etaMinutes).toBe(20);
  });
});

describe("liveLine", () => {
  it("describes each active state", () => {
    expect(liveLine({ status: "pending", etaMinutes: null })).toContain("Waiting");
    expect(liveLine({ status: "on_the_way", etaMinutes: 12 })).toBe("Arriving in about 12 min");
    expect(liveLine({ status: "on_the_way", etaMinutes: 0 })).toBe("Your pro has arrived");
    expect(liveLine({ status: "on_the_way", etaMinutes: null })).toBe("Your pro is on the way");
    expect(liveLine({ status: "in_progress", etaMinutes: null })).toBe("Work in progress");
  });
  it("says nothing for settled states", () => {
    expect(liveLine({ status: "completed", etaMinutes: null })).toBe(null);
    expect(liveLine({ status: "confirmed", etaMinutes: null })).toBe(null);
  });
});

describe("toBookingItem payment status", () => {
  it("carries payment_status through, null when the row pre-dates online payment", () => {
    expect(item(row({ id: "a", payment_status: "paid" })).paymentStatus).toBe("paid");
    expect(item(row({ id: "b" })).paymentStatus).toBeNull();
  });
});
