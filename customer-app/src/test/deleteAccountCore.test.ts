import { describe, expect, it } from "vitest";
import {
  DeletionError, deleteCustomerAccount, isActiveStatus, type Row,
} from "../../../database/supabase/functions/delete-customer-account/core";
import { FakeAdmin } from "./fakeAdmin";

const ME = "user-me";
const OTHER = "user-other";
const user = { id: ME, email: "Me@Example.com" };

const seed = (): { users: string[]; tables: Record<string, Row[]>; files: Record<string, string[]> } => ({
  users: [ME, OTHER],
  tables: {
    service_providers: [{ id: "p1", user_id: "provider-user" }],
    bookings: [
      { id: "b-pending", customer_id: ME, user_id: ME, status: "pending", customer_name: "Me", customer_phone: "999", address: "12 Street", city: "Rajkot", pincode: "360001", latitude: 22.3, longitude: 70.8, description: "leaky tap", special_instructions: "ring bell" },
      { id: "b-done", customer_id: ME, user_id: null, status: "completed", customer_name: "Me", customer_phone: "999", address: "12 Street", city: "Rajkot", pincode: "360001", latitude: 22.3, longitude: 70.8, description: "fan", special_instructions: null },
      { id: "b-other", customer_id: OTHER, user_id: OTHER, status: "confirmed", customer_name: "Other", customer_phone: "111", address: "9 Road", city: "Surat" },
    ],
    reviews: [
      { id: "r1", booking_id: "b-done", customer_id: ME, user_id: ME, reviewer_name: "Yuvraj", rating: 5, comment: "great" },
      { id: "r2", booking_id: "b-other", customer_id: OTHER, user_id: OTHER, reviewer_name: "Other", rating: 4 },
    ],
    customer_notifications: [{ id: "n1", user_id: ME }, { id: "n2", user_id: OTHER }],
    messages: [{ id: "m1", sender_id: ME, content: "hi" }, { id: "m2", sender_id: "provider-user", content: "hello" }],
    booking_attachments: [
      { id: "a1", uploaded_by: ME, storage_path: `${ME}/d1/photo.jpg` },
      { id: "a2", uploaded_by: OTHER, storage_path: `${OTHER}/d9/x.jpg` },
    ],
    contact_messages: [{ id: "c1", email: "me@example.com" }, { id: "c2", email: "other@example.com" }],
    pro_applications: [{ id: "pa1", email: "ME@example.com" }],
    profiles: [{ id: "pr1", user_id: ME }, { id: "pr2", user_id: OTHER }],
  },
  files: {
    "booking-attachments": [`${ME}/d1/photo.jpg`, `${ME}/d2/unattached-draft.m4a`, `${ME}/loose.png`, `${OTHER}/d9/x.jpg`],
  },
});

describe("isActiveStatus", () => {
  it("treats in-flight statuses as active and pending/terminal as not", () => {
    for (const s of ["confirmed", "on_the_way", "in_progress"]) expect(isActiveStatus(s)).toBe(true);
    for (const s of ["pending", "completed", "cancelled", "declined", "COMPLETED"]) expect(isActiveStatus(s)).toBe(false);
  });

  it("fails safe: an unknown or empty status counts as active, so a destructive delete is blocked", () => {
    for (const s of [null, undefined, "", "some_new_status"]) expect(isActiveStatus(s)).toBe(true);
  });
});

describe("deleteCustomerAccount — happy path", () => {
  it("anonymises history, removes personal data and files, deletes the user last", async () => {
    const db = new FakeAdmin(seed());
    const summary = await deleteCustomerAccount(db.client(), user);

    const bookings = Object.fromEntries(db.tables.bookings.map((b) => [b.id as string, b]));
    // pending one is cancelled AND scrubbed
    expect(bookings["b-pending"]).toMatchObject({ status: "cancelled", customer_id: null, user_id: null, customer_name: null, customer_phone: null, city: null, pincode: null, latitude: null, longitude: null, description: null, special_instructions: null, address: "Removed (account deleted)" });
    expect(bookings["b-pending"].cancellation_reason).toBe("Customer deleted their account");
    // completed one keeps its status (earnings must not change) but loses identity
    expect(bookings["b-done"]).toMatchObject({ status: "completed", customer_id: null, customer_name: null, address: "Removed (account deleted)" });

    // reviews kept, identity removed
    const r1 = db.tables.reviews.find((r) => r.id === "r1")!;
    expect(r1).toMatchObject({ reviewer_name: "Deleted user", user_id: null, rating: 5, comment: "great" });

    expect(db.tables.customer_notifications.map((n) => n.id)).toEqual(["n2"]);
    expect(db.tables.messages.map((m) => m.id)).toEqual(["m2"]); // provider's message untouched
    expect(db.tables.booking_attachments.map((a) => a.id)).toEqual(["a2"]);
    expect(db.tables.contact_messages.map((c) => c.id)).toEqual(["c2"]); // email match is case-insensitive
    expect(db.tables.pro_applications).toEqual([]);
    expect(db.tables.profiles.map((p) => p.id)).toEqual(["pr2"]);

    // every file under my prefix incl. nested draft folders; the other user's file survives
    expect(db.files["booking-attachments"]).toEqual([`${OTHER}/d9/x.jpg`]);
    expect(summary).toMatchObject({ cancelledPending: 1, anonymisedBookings: 2, anonymisedReviews: 1, filesRemoved: 3 });

    expect(db.authUsers.has(ME)).toBe(false);
    expect(db.authUsers.has(OTHER)).toBe(true);
    expect(db.log[db.log.length - 1]).toBe("auth.deleteUser");
  });

  it("never touches another user's rows", async () => {
    const db = new FakeAdmin(seed());
    await deleteCustomerAccount(db.client(), user);
    const other = db.tables.bookings.find((b) => b.id === "b-other")!;
    expect(other).toMatchObject({ customer_id: OTHER, status: "confirmed", customer_name: "Other", address: "9 Road" });
    expect(db.tables.reviews.find((r) => r.id === "r2")).toMatchObject({ reviewer_name: "Other", user_id: OTHER });
  });
});

describe("deleteCustomerAccount — refusals leave everything untouched", () => {
  const untouched = (db: FakeAdmin) => {
    expect(db.authUsers.has(ME)).toBe(true);
    expect(db.log.some((l) => l.endsWith(".update") || l.endsWith(".delete") || l === "auth.deleteUser" || l.startsWith("storage.remove"))).toBe(false);
  };

  it.each(["confirmed", "on_the_way", "in_progress"])("blocks while a booking is %s", async (status) => {
    const s = seed();
    s.tables.bookings.push({ id: "live", customer_id: ME, user_id: ME, status, address: "x" });
    const db = new FakeAdmin(s);
    await expect(deleteCustomerAccount(db.client(), user)).rejects.toMatchObject({ code: "active_booking" });
    untouched(db);
  });

  it("blocks while a completed booking is still unpaid, but not when it is paid or pre-dates payments", async () => {
    const s = seed();
    s.tables.bookings.push({ id: "owed", customer_id: ME, user_id: ME, status: "completed", payment_status: "unpaid", address: "x" });
    const db = new FakeAdmin(s);
    await expect(deleteCustomerAccount(db.client(), user)).rejects.toMatchObject({ code: "unpaid_booking" });
    untouched(db);

    const ok = seed();
    ok.tables.bookings.push({ id: "settled", customer_id: ME, user_id: ME, status: "completed", payment_status: "paid", address: "x" });
    await expect(deleteCustomerAccount(new FakeAdmin(ok).client(), user)).resolves.toBeDefined();
  });

  it("blocks when the same login is a provider", async () => {
    const s = seed();
    s.tables.service_providers.push({ id: "p2", user_id: ME });
    const db = new FakeAdmin(s);
    await expect(deleteCustomerAccount(db.client(), user)).rejects.toMatchObject({ code: "provider_account" });
    untouched(db);
  });

  it("catches an active booking that only has the legacy user_id set", async () => {
    const s = seed();
    s.tables.bookings.push({ id: "legacy", customer_id: null, user_id: ME, status: "in_progress", address: "x" });
    const db = new FakeAdmin(s);
    await expect(deleteCustomerAccount(db.client(), user)).rejects.toBeInstanceOf(DeletionError);
    untouched(db);
  });
});

describe("deleteCustomerAccount — failure handling", () => {
  it("skips tables that only exist in some environments", async () => {
    const db = new FakeAdmin(seed());
    db.missingTables.add("messages");
    db.missingTables.add("pro_applications");
    const summary = await deleteCustomerAccount(db.client(), user);
    expect(summary.skipped).toEqual(expect.arrayContaining(["delete chat messages", "delete pro applications"]));
    expect(db.authUsers.has(ME)).toBe(false);
  });

  it("aborts BEFORE deleting the login if a real step fails, and can be retried", async () => {
    const db = new FakeAdmin(seed());
    db.failures["customer_notifications.delete"] = { message: "permission denied", code: "42501" };
    await expect(deleteCustomerAccount(db.client(), user)).rejects.toMatchObject({ code: "step_failed", step: "delete notifications" });
    expect(db.authUsers.has(ME)).toBe(true);

    // fix the problem and press Delete again: it completes (idempotent)
    delete db.failures["customer_notifications.delete"];
    await deleteCustomerAccount(db.client(), user);
    expect(db.authUsers.has(ME)).toBe(false);
    expect(db.tables.customer_notifications.map((n) => n.id)).toEqual(["n2"]);
  });

  it("reports a failure of the final auth deletion", async () => {
    const db = new FakeAdmin(seed());
    db.authError = { message: "boom" };
    await expect(deleteCustomerAccount(db.client(), user)).rejects.toMatchObject({ code: "step_failed", step: "delete auth user" });
  });
});
