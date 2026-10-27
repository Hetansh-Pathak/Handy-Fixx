import { describe, expect, it } from "vitest";
import {
  allowedTransitions, BOOKING_STATUSES, canTransition, customerActions, customerCanCancel,
  customerStatusLabel, isActiveJob, isBookingStatus, isTerminal, providerStep,
} from "./status";

describe("transitions", () => {
  it("follows the happy path for the provider", () => {
    expect(canTransition("pending", "confirmed", "provider")).toBe(true);
    expect(canTransition("confirmed", "on_the_way", "provider")).toBe(true);
    expect(canTransition("on_the_way", "arrived", "provider")).toBe(true);
    expect(canTransition("arrived", "in_progress", "provider")).toBe(true);
    expect(canTransition("in_progress", "completed", "provider")).toBe(true);
  });
  it("lets the legacy flow skip `arrived` until the DB supports it", () => {
    expect(canTransition("on_the_way", "in_progress", "provider")).toBe(true);
  });
  it("customer can cancel only while pending or confirmed", () => {
    expect(canTransition("pending", "cancelled", "customer")).toBe(true);
    expect(canTransition("confirmed", "cancelled", "customer")).toBe(true);
    for (const s of ["on_the_way", "arrived", "in_progress", "completed"] as const) {
      expect(canTransition(s, "cancelled", "customer")).toBe(false);
      expect(customerCanCancel(s)).toBe(false);
    }
    expect(customerCanCancel("pending")).toBe(true);
  });
  it("customers can never advance a job; providers cannot confirm their own cancel after confirming", () => {
    expect(canTransition("pending", "confirmed", "customer")).toBe(false);
    expect(canTransition("confirmed", "cancelled", "provider")).toBe(false);
  });
  it("a provider can decline a pending request", () => {
    expect(canTransition("pending", "cancelled", "provider")).toBe(true);
  });
  it("admin can cancel any unfinished booking but nothing leaves a terminal state", () => {
    for (const s of BOOKING_STATUSES) {
      expect(canTransition(s, "cancelled", "admin")).toBe(!isTerminal(s));
      if (isTerminal(s)) expect(allowedTransitions(s, "admin")).toEqual([]);
    }
  });
  it("cannot skip steps or go backwards", () => {
    expect(canTransition("pending", "in_progress", "provider")).toBe(false);
    expect(canTransition("confirmed", "completed", "provider")).toBe(false);
    expect(canTransition("in_progress", "confirmed", "provider")).toBe(false);
  });
  it("lists allowed transitions", () => {
    expect(allowedTransitions("pending", "provider").sort()).toEqual(["cancelled", "confirmed"]);
  });
});

describe("helpers", () => {
  it("recognises statuses", () => {
    expect(isBookingStatus("arrived")).toBe(true);
    expect(isBookingStatus("nope")).toBe(false);
  });
  it("classifies active jobs", () => {
    expect(["on_the_way", "arrived", "in_progress"].every((s) => isActiveJob(s as never))).toBe(true);
    expect(isActiveJob("confirmed")).toBe(false);
  });
});

describe("providerStep: one primary button per step", () => {
  it("walks the PDF flow", () => {
    expect(providerStep("pending")).toEqual({ action: "accept", next: "confirmed" });
    expect(providerStep("confirmed")).toEqual({ action: "start_trip", next: "on_the_way" });
    expect(providerStep("on_the_way")).toEqual({ action: "arrived", next: "arrived" });
    expect(providerStep("arrived")).toEqual({ action: "start_job", next: "in_progress" });
    expect(providerStep("in_progress")).toEqual({ action: "enter_code", next: "completed" });
    expect(providerStep("completed")).toEqual({ action: "done", next: null });
    expect(providerStep("cancelled")).toBeNull();
  });
  it("skips the arrived step when the DB lacks it", () => {
    expect(providerStep("on_the_way", { withArrivedStep: false })).toEqual({ action: "start_job", next: "in_progress" });
  });
  it("every step's `next` is a legal provider transition", () => {
    for (const s of BOOKING_STATUSES) {
      const step = providerStep(s);
      if (step?.next) expect(canTransition(s, step.next, "provider")).toBe(true);
    }
    const legacy = providerStep("on_the_way", { withArrivedStep: false });
    expect(canTransition("on_the_way", legacy!.next!, "provider")).toBe(true);
  });
});

describe("customerActions (PDF p.5 table)", () => {
  it("per state", () => {
    expect(customerActions("pending")).toEqual(["cancel"]);
    expect(customerActions("confirmed")).toEqual(["chat", "cancel"]);
    expect(customerActions("in_progress")).toEqual(["track", "chat", "approve_extra"]);
    expect(customerActions("on_the_way")).not.toContain("cancel");
    expect(customerActions("cancelled")).toEqual(["book_again", "see_next_best_pros"]);
  });
  it("completed: rate once, report only while the window is open, always book again", () => {
    expect(customerActions("completed", { disputeWindowOpen: true })).toEqual(["rate", "report_problem", "book_again"]);
    expect(customerActions("completed", { alreadyReviewed: true })).toEqual(["book_again"]);
    expect(customerActions("completed", { alreadyReviewed: true, disputeWindowOpen: true }))
      .toEqual(["report_problem", "book_again"]);
  });
});

describe("customerStatusLabel", () => {
  it("uses the provider name when known", () => {
    expect(customerStatusLabel("confirmed", "Rajesh")).toBe("Rajesh accepted");
    expect(customerStatusLabel("on_the_way", " ")).toBe("Your pro is on the way");
    expect(customerStatusLabel("pending")).toBe("Finding your pro");
  });
});
