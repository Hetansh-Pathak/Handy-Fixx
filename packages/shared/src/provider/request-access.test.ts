import { describe, expect, it } from "vitest";
import {
  LOCKED_CARD_CAP, addressVisibleToProvider, lockedEarningLine, partitionByAccess, requestAccess, whereForProvider,
} from "./request-access";

const rich = { balance: 100, due: 0 };
const poor = { balance: 3, due: 0 };

describe("requestAccess", () => {
  it("is open when the wallet covers the fee", () => {
    expect(requestAccess({ price: 349, wallet: rich, launchActive: false })).toEqual({ state: "open", fee: 10, feeWaived: false });
  });
  it("is locked when the wallet is below the fee, with the pack to buy", () => {
    const a = requestAccess({ price: 349, wallet: poor, launchActive: false });
    expect(a).toMatchObject({ state: "locked", reason: "insufficient_wallet", fee: 10, shortfall: 7, topUp: 49, cta: "Recharge ₹49 to accept" });
    if (a.state === "locked") expect(a.message).toContain("below the ₹10 fee");
  });
  it("is open at exactly the fee, locked one rupee below", () => {
    expect(requestAccess({ price: 349, wallet: { balance: 10, due: 0 }, launchActive: false }).state).toBe("open");
    expect(requestAccess({ price: 349, wallet: { balance: 9, due: 0 }, launchActive: false }).state).toBe("locked");
  });
  it("a bigger job needs a bigger wallet: the cap fee is ₹50", () => {
    expect(requestAccess({ price: 5000, wallet: { balance: 49, due: 0 }, launchActive: false }).state).toBe("locked");
    expect(requestAccess({ price: 5000, wallet: { balance: 50, due: 0 }, launchActive: false }).state).toBe("open");
  });
  it("is never locked in the launch period, and shows the fee as waived", () => {
    expect(requestAccess({ price: 349, wallet: { balance: 0, due: 0 }, launchActive: true })).toEqual({ state: "open", fee: 10, feeWaived: true });
  });
  it("is locked by an old due even when the balance looks big", () => {
    const a = requestAccess({ price: 349, wallet: { balance: 40, due: 20 }, launchActive: false });
    expect(a).toMatchObject({ state: "locked", reason: "due_outstanding" });
  });
  it("does not lock while the wallet is still loading", () => {
    expect(requestAccess({ price: 349, wallet: { balance: 0, due: 0 }, launchActive: false, walletReady: false }).state).toBe("open");
  });
  it("an empty price never locks (no fee)", () => {
    expect(requestAccess({ price: 0, wallet: { balance: 0, due: 0 }, launchActive: false }).state).toBe("open");
  });
});

describe("partitionByAccess", () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, locked: id % 2 === 0 }));
  it("puts open first, caps locked cards at 3 and counts the rest", () => {
    const p = partitionByAccess(rows, (r) => r.locked);
    expect(p.open.map((r) => r.id)).toEqual([1, 3, 5, 7]);
    expect(p.locked.map((r) => r.id)).toEqual([2, 4, 6]);
    expect(p.hiddenLocked).toBe(0);
    expect(p.lockedTotal).toBe(3);
  });
  it("shows +N more when there are more locked than the cap", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: i }));
    const p = partitionByAccess(many, () => true);
    expect(LOCKED_CARD_CAP).toBe(3);
    expect(p.locked).toHaveLength(3);
    expect(p.hiddenLocked).toBe(5);
    expect(p.lockedTotal).toBe(8);
    expect(p.open).toEqual([]);
  });
  it("handles an empty list and a zero or odd cap", () => {
    expect(partitionByAccess([], () => true)).toEqual({ open: [], locked: [], hiddenLocked: 0, lockedTotal: 0 });
    expect(partitionByAccess([1, 2], () => true, 0)).toMatchObject({ locked: [], hiddenLocked: 2 });
    expect(partitionByAccess([1, 2], () => true, -4)).toMatchObject({ locked: [], hiddenLocked: 2 });
    expect(partitionByAccess([1, 2, 3], () => true, 1.9)).toMatchObject({ locked: [1], hiddenLocked: 2 });
  });
});

describe("what the pro may see before and after accepting", () => {
  const b = { address: "12 Gandhi Road, Flat 4", city: "Gandhinagar", pincode: "382010" };
  it("hides the street address until the job is accepted", () => {
    expect(addressVisibleToProvider("pending")).toBe(false);
    expect(addressVisibleToProvider("cancelled")).toBe(false);
    for (const s of ["confirmed", "on_the_way", "arrived", "in_progress", "completed"] as const) expect(addressVisibleToProvider(s)).toBe(true);
    const text = whereForProvider(b, "pending");
    expect(text).toBe("Gandhinagar, 382010 (full address after you accept)");
    expect(text).not.toContain("Gandhi Road");
  });
  it("shows the full address once accepted", () => {
    expect(whereForProvider(b, "confirmed")).toBe("12 Gandhi Road, Flat 4, Gandhinagar, 382010");
  });
  it("copes with missing parts", () => {
    expect(whereForProvider({ address: null, city: null, pincode: null }, "pending")).toBe("Full address after you accept");
    expect(whereForProvider({ address: null, city: null, pincode: null }, "confirmed")).toBe("Address not shared");
    expect(whereForProvider({ address: "  ", city: "Anand" }, "pending")).toBe("Anand (full address after you accept)");
  });
});

describe("lockedEarningLine", () => {
  it("shows what the pro would earn and keep", () => {
    expect(lockedEarningLine(349)).toBe("You would earn ₹349 · fee ₹10 · you would keep ₹339");
  });
});
