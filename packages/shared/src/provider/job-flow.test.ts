import { describe, expect, it } from "vitest";
import { BOOKING_STATUSES, canTransition, type BookingStatus } from "../booking/status";
import {
  canDecline, declinePatch, isGuardedFieldError, patchFallbacks, providerStatusLabel, isPatchAction, jobProgress, phoneVisibleToProvider, PROVIDER_ACTION_LABEL, providerActionPatch,
  sharesLocation,
} from "./job-flow";

const now = new Date("2026-11-10T10:00:00.000Z");

describe("providerActionPatch", () => {
  it("accept confirms the booking", () => {
    expect(providerActionPatch("accept", now)).toEqual({ status: "confirmed", patch: { status: "confirmed" } });
  });
  it("start trip records the departure and turns live tracking on", () => {
    expect(providerActionPatch("start_trip", now).patch).toEqual({
      status: "on_the_way", provider_departed_at: now.toISOString(), tracking_active: true,
    });
    expect(providerActionPatch("start_trip", now, { etaMinutes: 18 }).patch.provider_eta_minutes).toBe(18);
  });
  it("arrived turns tracking off; start job records the start time", () => {
    expect(providerActionPatch("arrived", now).patch).toEqual({ status: "arrived", tracking_active: false });
    expect(providerActionPatch("start_job", now).patch).toEqual({ status: "in_progress", started_at: now.toISOString(), tracking_active: false });
  });
  it("every patch is a legal provider transition from the status that offers it", () => {
    const pairs: [BookingStatus, "accept" | "start_trip" | "arrived" | "start_job"][] = [
      ["pending", "accept"], ["confirmed", "start_trip"], ["on_the_way", "arrived"], ["arrived", "start_job"],
    ];
    for (const [from, action] of pairs) {
      expect(canTransition(from, providerActionPatch(action, now).status, "provider")).toBe(true);
    }
  });
  it("only some actions are row patches", () => {
    expect(isPatchAction("accept")).toBe(true);
    expect(isPatchAction("enter_code")).toBe(false);
    expect(isPatchAction("done")).toBe(false);
  });
});

describe("decline", () => {
  it("cancels with a reason and a timestamp", () => {
    expect(declinePatch(now)).toEqual({ status: "cancelled", cancelled_at: now.toISOString(), cancellation_reason: "Declined by provider" });
  });
  it("is only possible while pending, and is a legal transition", () => {
    for (const s of BOOKING_STATUSES) expect(canDecline(s)).toBe(s === "pending");
    expect(canTransition("pending", "cancelled", "provider")).toBe(true);
  });
});

describe("visibility rules", () => {
  it("shares location only while on the way", () => {
    for (const s of BOOKING_STATUSES) expect(sharesLocation(s)).toBe(s === "on_the_way");
  });
  it("shows the customer's phone only after accepting and until the job is over", () => {
    expect(phoneVisibleToProvider("pending")).toBe(false);
    for (const s of ["confirmed", "on_the_way", "arrived", "in_progress"] as const) expect(phoneVisibleToProvider(s)).toBe(true);
    expect(phoneVisibleToProvider("completed")).toBe(false);
    expect(phoneVisibleToProvider("cancelled")).toBe(false);
  });
});

describe("jobProgress", () => {
  it("counts four steps with the arrived step", () => {
    expect(jobProgress("confirmed")).toEqual({ current: 1, total: 4, label: "Start trip" });
    expect(jobProgress("on_the_way")).toEqual({ current: 2, total: 4, label: "I've arrived" });
    expect(jobProgress("arrived")).toEqual({ current: 3, total: 4, label: "Start job" });
    expect(jobProgress("in_progress")).toEqual({ current: 4, total: 4, label: "Enter customer's code" });
  });
  it("counts three steps while the database has no arrived status", () => {
    const o = { withArrivedStep: false };
    expect(jobProgress("on_the_way", o)).toEqual({ current: 2, total: 3, label: "Start job" });
    expect(jobProgress("in_progress", o)).toEqual({ current: 3, total: 3, label: "Enter customer's code" });
  });
  it("has no progress before accepting or after the job ends", () => {
    for (const s of ["pending", "completed", "cancelled"] as const) expect(jobProgress(s)).toBeNull();
  });
  it("has a label for every action", () => {
    expect(Object.keys(PROVIDER_ACTION_LABEL).sort()).toEqual(["accept", "arrived", "done", "enter_code", "start_job", "start_trip"]);
  });
});

describe("providerStatusLabel", () => {
  it("uses the pro's own wording, never the customer's", () => {
    expect(providerStatusLabel("pending")).toBe("New request");
    expect(providerStatusLabel("confirmed")).toBe("Ready to start");
    expect(providerStatusLabel("on_the_way")).toBe("On the way");
    expect(providerStatusLabel("arrived")).toBe("You've arrived");
    expect(providerStatusLabel("in_progress")).toBe("Job in progress");
    expect(providerStatusLabel("completed")).toBe("Completed");
    expect(providerStatusLabel("cancelled")).toBe("Cancelled");
  });
  it("has a label for every status", () => {
    for (const s of BOOKING_STATUSES) expect(providerStatusLabel(s).length).toBeGreaterThan(0);
  });
});

describe("patchFallbacks (guard trigger refuses extra columns)", () => {
  it("retries a trip start with the status alone, then each extra on its own", () => {
    const { essential, extras } = patchFallbacks({ status: "on_the_way", provider_departed_at: "t", tracking_active: true });
    expect(essential).toEqual([{ status: "on_the_way" }]);
    expect(extras).toEqual([{ provider_departed_at: "t" }, { tracking_active: true }]);
  });
  it("keeps the decline reason with the status, with a plain status change as the last resort", () => {
    const { essential, extras } = patchFallbacks({ status: "cancelled", cancelled_at: "t", cancellation_reason: "Declined by provider" });
    expect(essential).toEqual([{ status: "cancelled", cancelled_at: "t", cancellation_reason: "Declined by provider" }, { status: "cancelled" }]);
    expect(extras).toEqual([]);
  });
  it("recognises the guard's message", () => {
    expect(isGuardedFieldError("Providers cannot change these booking fields")).toBe(true);
    expect(isGuardedFieldError("permission denied for table bookings")).toBe(false);
  });
});
