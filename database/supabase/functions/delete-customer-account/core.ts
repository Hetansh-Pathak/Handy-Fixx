// Pure account-deletion logic. No remote imports, so it can be unit tested in Node (vitest)
// as well as run inside the Supabase Edge Function runtime (index.ts).
//
// Design decisions (see PHASE10-CHANGES.md):
//  * Bookings are ANONYMISED, never deleted. provider_earnings / reviews point at them and the
//    provider's accounting history must survive. (bookings.customer_id also has no ON DELETE
//    action in the live schema, so deleting the auth user first would fail halfway.)
//  * Everything is idempotent: if a later step fails the user can simply press Delete again.
//  * The auth user is deleted LAST, so a failure never leaves an account that exists but is empty.

export type Row = Record<string, unknown>;
export interface DbError { message: string; code?: string }
export interface Result { data: Row[] | null; error: DbError | null }
export interface Query extends PromiseLike<Result> {
  eq(column: string, value: string): Query;
  ilike(column: string, value: string): Query;
}
export interface Table {
  select(columns: string): Query;
  update(patch: Row): Query;
  delete(): Query;
}
export interface Bucket {
  list(path: string, options?: { limit: number }): Promise<{ data: { name: string; id: string | null }[] | null; error: DbError | null }>;
  remove(paths: string[]): Promise<{ error: DbError | null }>;
}
export interface AdminClient {
  from(table: string): Table;
  storage: { from(bucket: string): Bucket };
  auth: { admin: { deleteUser(id: string): Promise<{ error: DbError | null }> } };
}

export type DeletionErrorCode = "provider_account" | "active_booking" | "unpaid_booking" | "step_failed";
export class DeletionError extends Error {
  code: DeletionErrorCode;
  step?: string;
  constructor(code: DeletionErrorCode, message: string, step?: string) {
    super(message);
    this.code = code;
    this.step = step;
  }
}

export const CONFIRM_PHRASE = "DELETE";
export const ATTACHMENT_BUCKET = "booking-attachments";
const TERMINAL_STATUSES = ["completed", "cancelled", "declined", "rejected", "expired"];
const ANONYMISED_ADDRESS = "Removed (account deleted)";
const DELETED_NAME = "Deleted user";

// Tables/columns that only exist in the live DB may be absent in some environments.
const isMissing = (e: DbError) =>
  ["42P01", "42703", "PGRST204", "PGRST205"].includes(e.code ?? "") ||
  /does not exist|could not find the .* (table|column)|schema cache/i.test(e.message);

export const isActiveStatus = (status: unknown) => {
  const s = String(status ?? "").toLowerCase();
  return s !== "pending" && !TERMINAL_STATUSES.includes(s);
};

export const anonymisedBookingPatch = (): Row => ({
  customer_id: null,
  user_id: null,
  customer_name: null,
  customer_phone: null,
  address: ANONYMISED_ADDRESS, // NOT NULL column
  city: null,
  pincode: null,
  latitude: null,
  longitude: null,
  description: null,
  special_instructions: null,
});

export interface DeletionSummary {
  cancelledPending: number;
  anonymisedBookings: number;
  anonymisedReviews: number;
  filesRemoved: number;
  skipped: string[];
}

export async function deleteCustomerAccount(
  admin: AdminClient,
  user: { id: string; email?: string | null },
): Promise<DeletionSummary> {
  const uid = user.id;
  const email = (user.email ?? "").trim().toLowerCase();
  const summary: DeletionSummary = { cancelledPending: 0, anonymisedBookings: 0, anonymisedReviews: 0, filesRemoved: 0, skipped: [] };

  // Runs one step. A missing table/column is skipped (and reported); any other error aborts
  // BEFORE the auth user is touched.
  const step = async <T>(name: string, run: () => PromiseLike<{ data?: T | null; error: DbError | null }>) => {
    const { data, error } = await run();
    if (error) {
      if (isMissing(error)) { summary.skipped.push(name); return null; }
      throw new DeletionError("step_failed", `${name}: ${error.message}`, name);
    }
    return (data ?? null) as T | null;
  };

  // ── 1. Guards ────────────────────────────────────────────────────────────────
  const providerRows = await step<Row[]>("check provider account", () => admin.from("service_providers").select("id").eq("user_id", uid));
  if (providerRows && providerRows.length > 0) {
    throw new DeletionError("provider_account", "This login is also a provider account.");
  }

  const bookingMap = new Map<string, Row>();
  for (const col of ["customer_id", "user_id"]) {
    const rows = await step<Row[]>(`load bookings by ${col}`, () => admin.from("bookings").select("id,status,payment_status").eq(col, uid));
    for (const r of rows ?? []) bookingMap.set(String(r.id), r);
  }
  if ([...bookingMap.values()].some((b) => isActiveStatus(b.status))) {
    throw new DeletionError("active_booking", "A booking is currently in progress.");
  }
  // Money owed to a provider for finished work must be settled before the account can go.
  if ([...bookingMap.values()].some((b) => String(b.status).toLowerCase() === "completed" && String(b.payment_status ?? "").toLowerCase() === "unpaid")) {
    throw new DeletionError("unpaid_booking", "A completed booking has not been paid yet.");
  }

  // ── 2. Collect storage paths before their rows disappear ─────────────────────
  const paths = new Set<string>();
  const attRows = await step<Row[]>("load attachments", () => admin.from("booking_attachments").select("storage_path").eq("uploaded_by", uid));
  for (const r of attRows ?? []) if (r.storage_path) paths.add(String(r.storage_path));

  // ── 3. Cancel pending bookings (notifies the provider via the existing trigger) ─
  const now = new Date().toISOString();
  for (const col of ["customer_id", "user_id"]) {
    const pending = [...bookingMap.values()].filter((b) => String(b.status).toLowerCase() === "pending");
    if (pending.length === 0) break;
    await step(`cancel pending (${col})`, () =>
      admin.from("bookings")
        .update({ status: "cancelled", cancelled_at: now, cancellation_reason: "Customer deleted their account" })
        .eq(col, uid)
        .eq("status", "pending"),
    );
  }
  summary.cancelledPending = [...bookingMap.values()].filter((b) => String(b.status).toLowerCase() === "pending").length;

  // ── 4. Anonymise bookings + reviews (history is kept, identity is not) ───────
  for (const col of ["customer_id", "user_id"]) {
    await step(`anonymise bookings (${col})`, () => admin.from("bookings").update(anonymisedBookingPatch()).eq(col, uid));
  }
  summary.anonymisedBookings = bookingMap.size;

  const reviewIds = new Set<string>();
  for (const col of ["customer_id", "user_id"]) {
    const rows = await step<Row[]>(`load reviews (${col})`, () => admin.from("reviews").select("id").eq(col, uid));
    for (const r of rows ?? []) reviewIds.add(String(r.id));
    // reviews.customer_id is NOT NULL, so it keeps the (now meaningless) id; the name and user_id go.
    await step(`anonymise reviews (${col})`, () => admin.from("reviews").update({ reviewer_name: DELETED_NAME, user_id: null }).eq(col, uid));
  }
  summary.anonymisedReviews = reviewIds.size;

  // ── 5. Delete the customer's own rows ────────────────────────────────────────
  await step("delete notifications", () => admin.from("customer_notifications").delete().eq("user_id", uid));
  await step("delete chat messages", () => admin.from("messages").delete().eq("sender_id", uid));
  await step("delete attachment rows", () => admin.from("booking_attachments").delete().eq("uploaded_by", uid));
  if (email) {
    await step("delete contact messages", () => admin.from("contact_messages").delete().ilike("email", email));
    await step("delete pro applications", () => admin.from("pro_applications").delete().ilike("email", email));
  }

  // ── 6. Storage: attachments are uploaded to {userId}/{draftId}/{file} ────────
  const bucket = admin.storage.from(ATTACHMENT_BUCKET);
  const top = await bucket.list(uid, { limit: 1000 });
  if (top.error && !isMissing(top.error) && !/not found/i.test(top.error.message)) {
    throw new DeletionError("step_failed", `list files: ${top.error.message}`, "list files");
  }
  for (const entry of top.data ?? []) {
    if (entry.id === null) {
      const inner = await bucket.list(`${uid}/${entry.name}`, { limit: 1000 });
      for (const f of inner.data ?? []) if (f.id !== null) paths.add(`${uid}/${entry.name}/${f.name}`);
    } else {
      paths.add(`${uid}/${entry.name}`);
    }
  }
  const all = [...paths];
  for (let i = 0; i < all.length; i += 100) {
    const { error } = await bucket.remove(all.slice(i, i + 100));
    if (error) throw new DeletionError("step_failed", `remove files: ${error.message}`, "remove files");
  }
  summary.filesRemoved = all.length;

  // ── 7. Profile, then the auth user (cascades the remaining user_id tables) ───
  await step("delete profile", () => admin.from("profiles").delete().eq("user_id", uid));
  const { error: authError } = await admin.auth.admin.deleteUser(uid);
  if (authError) throw new DeletionError("step_failed", `delete auth user: ${authError.message}`, "delete auth user");

  return summary;
}
