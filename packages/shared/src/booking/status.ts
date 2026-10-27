/**
 * Booking lifecycle from HandyFix-complete.pdf (p.10).
 * NOTE: `arrived` does not exist in the database yet (needs a migration). Until it does,
 * pass `{ withArrivedStep: false }` to the provider helpers.
 */
export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "on_the_way",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type Actor = "customer" | "provider" | "admin" | "system";

export function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value);
}

const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, readonly Actor[]>>> = {
  pending: { confirmed: ["provider"], cancelled: ["customer", "provider", "admin", "system"] },
  confirmed: { on_the_way: ["provider"], cancelled: ["customer", "admin"] },
  on_the_way: { arrived: ["provider"], in_progress: ["provider"], cancelled: ["admin"] },
  arrived: { in_progress: ["provider"], cancelled: ["admin"] },
  // Completion happens only through the completion-code RPC (direct updates are blocked in the DB).
  in_progress: { completed: ["provider"], cancelled: ["admin"] },
  completed: {},
  cancelled: {},
};

export function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function allowedTransitions(from: BookingStatus, actor: Actor): BookingStatus[] {
  return (Object.keys(TRANSITIONS[from]) as BookingStatus[]).filter((to) => canTransition(from, to, actor));
}

export const isTerminal = (s: BookingStatus) => s === "completed" || s === "cancelled";

/** Provider is travelling to or working at the job. */
export const isActiveJob = (s: BookingStatus) => s === "on_the_way" || s === "arrived" || s === "in_progress";

/** Customer may cancel only while pending or confirmed; hidden once the pro starts the trip. */
export const customerCanCancel = (s: BookingStatus) => s === "pending" || s === "confirmed";

export type ProviderAction = "accept" | "start_trip" | "arrived" | "start_job" | "enter_code" | "done";

export type ProviderStep = { action: ProviderAction; next: BookingStatus | null };

/** The ONE primary button the provider sees per step (PDF p.7). `null` when nothing is left to do. */
export function providerStep(status: BookingStatus, opts: { withArrivedStep?: boolean } = {}): ProviderStep | null {
  const withArrived = opts.withArrivedStep ?? true;
  switch (status) {
    case "pending": return { action: "accept", next: "confirmed" };
    case "confirmed": return { action: "start_trip", next: "on_the_way" };
    case "on_the_way":
      return withArrived ? { action: "arrived", next: "arrived" } : { action: "start_job", next: "in_progress" };
    case "arrived": return { action: "start_job", next: "in_progress" };
    case "in_progress": return { action: "enter_code", next: "completed" };
    case "completed": return { action: "done", next: null };
    case "cancelled": return null;
  }
}

export type CustomerAction =
  | "cancel"
  | "chat"
  | "track"
  | "approve_extra"
  | "rate"
  | "report_problem"
  | "book_again"
  | "see_next_best_pros";

/** Buttons the customer sees per state (PDF p.5). */
export function customerActions(
  status: BookingStatus,
  ctx: { alreadyReviewed?: boolean; disputeWindowOpen?: boolean } = {},
): CustomerAction[] {
  switch (status) {
    case "pending": return ["cancel"];
    case "confirmed": return ["chat", "cancel"];
    case "on_the_way":
    case "arrived":
    case "in_progress": return ["track", "chat", "approve_extra"];
    case "completed": {
      const actions: CustomerAction[] = [];
      if (!ctx.alreadyReviewed) actions.push("rate");
      if (ctx.disputeWindowOpen) actions.push("report_problem");
      actions.push("book_again");
      return actions;
    }
    case "cancelled": return ["book_again", "see_next_best_pros"];
  }
}

/** What the customer's booking card says (PDF p.10, "Customer sees"). */
export function customerStatusLabel(status: BookingStatus, providerName?: string): string {
  const name = providerName?.trim() || "Your pro";
  switch (status) {
    case "pending": return "Finding your pro";
    case "confirmed": return `${name} accepted`;
    case "on_the_way": return `${name} is on the way`;
    case "arrived": return `${name} has arrived`;
    case "in_progress": return "Work in progress";
    case "completed": return "All done";
    case "cancelled": return "Cancelled";
  }
}
