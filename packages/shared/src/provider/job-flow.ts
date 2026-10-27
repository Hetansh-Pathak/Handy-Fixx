import { providerStep, type BookingStatus, type ProviderAction } from "../booking/status";

/** The one primary button the pro sees at each step (PDF p.7). */
export const PROVIDER_ACTION_LABEL: Record<ProviderAction, string> = {
  accept: "Accept",
  start_trip: "Start trip",
  arrived: "I've arrived",
  start_job: "Start job",
  enter_code: "Enter customer's code",
  done: "Done",
};

export type BookingPatch = Record<string, string | number | boolean | null>;

/** Actions that change the booking row directly. (`enter_code` goes through the completion RPC, `done` closes the screen.) */
export type PatchAction = Exclude<ProviderAction, "enter_code" | "done">;

export const isPatchAction = (a: ProviderAction): a is PatchAction => a !== "enter_code" && a !== "done";

/** Columns written for each button. Mirrors what the old provider portal wrote, plus `arrived`. */
export function providerActionPatch(
  action: PatchAction,
  now: Date,
  opts: { etaMinutes?: number | null } = {},
): { status: BookingStatus; patch: BookingPatch } {
  const at = now.toISOString();
  switch (action) {
    case "accept":
      return { status: "confirmed", patch: { status: "confirmed" } };
    case "start_trip":
      return {
        status: "on_the_way",
        patch: {
          status: "on_the_way",
          provider_departed_at: at,
          tracking_active: true,
          ...(opts.etaMinutes != null ? { provider_eta_minutes: opts.etaMinutes } : {}),
        },
      };
    case "arrived":
      return { status: "arrived", patch: { status: "arrived", tracking_active: false } };
    case "start_job":
      return { status: "in_progress", patch: { status: "in_progress", started_at: at, tracking_active: false } };
  }
}

/** A pro declines a pending request: costs ₹0, and the customer is offered the next best pros. */
export function declinePatch(now: Date): BookingPatch {
  return { status: "cancelled", cancelled_at: now.toISOString(), cancellation_reason: "Declined by provider" };
}

/** Only a request that has not been accepted yet can be declined. */
export const canDecline = (status: BookingStatus) => status === "pending";

/** Live location is shared only while travelling. */
export const sharesLocation = (status: BookingStatus) => status === "on_the_way";

/** The customer's phone number appears only once the pro has accepted, and only while the job is active. */
export const phoneVisibleToProvider = (status: BookingStatus) =>
  status === "confirmed" || status === "on_the_way" || status === "arrived" || status === "in_progress";

export type JobProgress = { current: number; total: number; label: string };

/** "STEP 3 OF 4" for the step the pro is about to do. Null when there is no step left (pending, done, cancelled). */
export function jobProgress(status: BookingStatus, opts: { withArrivedStep?: boolean } = {}): JobProgress | null {
  const withArrived = opts.withArrivedStep ?? true;
  const step = providerStep(status, opts);
  if (!step || step.action === "accept" || step.action === "done") return null;
  const order: ProviderAction[] = withArrived
    ? ["start_trip", "arrived", "start_job", "enter_code"]
    : ["start_trip", "start_job", "enter_code"];
  const index = order.indexOf(step.action);
  return index === -1 ? null : { current: index + 1, total: order.length, label: PROVIDER_ACTION_LABEL[step.action] };
}

/** How a booking reads on the PRO's screen (the customer sees different words, see `customerStatusLabel`). */
export function providerStatusLabel(status: BookingStatus): string {
  switch (status) {
    case "pending": return "New request";
    case "confirmed": return "Ready to start";
    case "on_the_way": return "On the way";
    case "arrived": return "You've arrived";
    case "in_progress": return "Job in progress";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
  }
}
