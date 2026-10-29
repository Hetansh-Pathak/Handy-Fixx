import { describe, expect, it } from "vitest";
import { checkCanAccept } from "../money/wallet";
import { acceptBlockMessage, heldFromSummary, jobsCoveredLine, launchLine, providerLaunchStatus, walletStateFromSummary } from "./wallet-view";

const now = new Date("2026-12-15T00:00:00Z");

describe("heldFromSummary and jobsCoveredLine", () => {
  it("reads the held fees, 0 before holds exist", () => {
    expect(heldFromSummary({ balance: 60, available: 48, dues: 0, held: 12 })).toBe(12);
    expect(heldFromSummary({ balance: 60, available: 60, dues: 0 })).toBe(0);
    expect(heldFromSummary(null)).toBe(0);
  });
  it("words the wallet headline", () => {
    expect(jobsCoveredLine(8)).toBe("Covers about 8 more jobs");
    expect(jobsCoveredLine(1)).toBe("Covers about 1 more job");
    expect(jobsCoveredLine(0)).toBe("Recharge to accept new jobs");
  });
});

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
  it("explains a blocked accept with the pack to recharge", () => {
    const low = checkCanAccept({ wallet: { balance: 5, due: 0 }, estimatedServiceBill: 349, launchActive: false });
    const due = checkCanAccept({ wallet: { balance: 0, due: 45 }, estimatedServiceBill: 349, launchActive: false });
    if (low.ok || due.ok) throw new Error("expected blocked");
    expect(acceptBlockMessage(low)).toBe("Recharge ₹49 to accept. Your wallet is below the ₹10 fee.");
    expect(acceptBlockMessage(due)).toBe("Recharge ₹99 to clear ₹45 you owe and accept new jobs.");
  });
  it("describes the launch period, singular and plural", () => {
    expect(launchLine({ active: true, endsAt: now, jobsLeft: 6, daysLeft: 48 })).toBe("Fee-free launch: 6 jobs or 2 months left");
    expect(launchLine({ active: true, endsAt: now, jobsLeft: 1, daysLeft: 10 })).toBe("Fee-free launch: 1 job or 1 month left");
    expect(launchLine({ active: false, reason: "time_over" })).toBe("");
  });
});
