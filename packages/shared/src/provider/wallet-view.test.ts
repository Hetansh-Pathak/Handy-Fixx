import { describe, expect, it } from "vitest";
import { checkCanAccept } from "../money/wallet";
import { acceptBlockMessage, launchLine, providerLaunchStatus, walletStateFromSummary } from "./wallet-view";

const now = new Date("2026-12-15T00:00:00Z");

describe("walletStateFromSummary (live get_wallet_summary → fee rules)", () => {
  it("maps available and dues", () => {
    expect(walletStateFromSummary({ balance: 240, available: 240, dues: 0 })).toEqual({ balance: 240, due: 0 });
    expect(walletStateFromSummary({ balance: -45, available: 0, dues: 45 })).toEqual({ balance: 0, due: 45 });
  });
  it("copes with strings, missing values and nonsense", () => {
    expect(walletStateFromSummary({ available: "120.50" as unknown as number, dues: 0 })).toEqual({ balance: 120.5, due: 0 });
    expect(walletStateFromSummary(null)).toEqual({ balance: 0, due: 0 });
    expect(walletStateFromSummary({ available: -5, dues: -9 })).toEqual({ balance: 0, due: 0 });
  });
});

describe("providerLaunchStatus", () => {
  it("starts at approval and counts completed jobs", () => {
    const s = providerLaunchStatus({ kycReviewedAt: "2026-11-01T00:00:00Z", totalJobs: 4 }, now);
    expect(s).toMatchObject({ active: true, jobsLeft: 6 });
  });
  it("is not active before approval, after 10 jobs, or after 3 months", () => {
    expect(providerLaunchStatus({ kycReviewedAt: null, totalJobs: 0 }, now)).toEqual({ active: false, reason: "not_started" });
    expect(providerLaunchStatus({ kycReviewedAt: "garbage", totalJobs: 0 }, now)).toEqual({ active: false, reason: "not_started" });
    expect(providerLaunchStatus({ kycReviewedAt: "2026-11-01T00:00:00Z", totalJobs: 10 }, now)).toEqual({ active: false, reason: "jobs_over" });
    expect(providerLaunchStatus({ kycReviewedAt: "2026-01-01T00:00:00Z", totalJobs: 1 }, now)).toEqual({ active: false, reason: "time_over" });
  });
  it("treats missing job counts as zero", () => {
    expect(providerLaunchStatus({ kycReviewedAt: "2026-11-01T00:00:00Z", totalJobs: null }, now)).toMatchObject({ active: true, jobsLeft: 10 });
  });
});

describe("messages", () => {
  it("explains a blocked accept with the amount to top up", () => {
    const low = checkCanAccept({ wallet: { balance: 5, due: 0 }, estimatedServiceBill: 349, launchActive: false });
    const due = checkCanAccept({ wallet: { balance: 0, due: 45 }, estimatedServiceBill: 349, launchActive: false });
    if (low.ok || due.ok) throw new Error("expected blocked");
    expect(acceptBlockMessage(low)).toBe("Wallet below the fee. Top up ₹100 to accept.");
    expect(acceptBlockMessage(due)).toBe("You have dues to clear. Top up ₹100 to accept new jobs.");
  });
  it("describes the launch period, singular and plural", () => {
    expect(launchLine({ active: true, endsAt: now, jobsLeft: 6, daysLeft: 48 })).toBe("Fee-free launch: 6 jobs or 2 months left");
    expect(launchLine({ active: true, endsAt: now, jobsLeft: 1, daysLeft: 10 })).toBe("Fee-free launch: 1 job or 1 month left");
    expect(launchLine({ active: false, reason: "time_over" })).toBe("");
  });
});
