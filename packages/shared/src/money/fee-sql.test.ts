import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FEE_MAX, FEE_MIN, FEE_RATE } from "./fee";
import { LAUNCH_PERIOD } from "./launch";
import { RECHARGE_PACK_AMOUNTS } from "./wallet";

// Guards against the TypeScript rules and the SQL drifting apart.
const read = (name: string) => readFileSync(resolve(__dirname, "../../../../supabase/proposals", name), "utf8");
const fee = read("20261114000000_fee_3pct_holds_autoclose_PROPOSAL_NOT_APPLIED.sql");
// The launch rule (provider_launch_active) is redefined by 20261115 (1 month); 20261102000001 keeps the original 3 months.
const launch = read("20261115000000_launch_one_month_PROPOSAL_NOT_APPLIED.sql");

describe("SQL matches the shared fee rules", () => {
  it("uses the same 3%, minimum and maximum", () => {
    expect(fee).toContain(`LEAST(${FEE_MAX}, GREATEST(${FEE_MIN}, round(p_bill * ${FEE_RATE})))`);
  });
  it("suggests the same recharge packs", () => {
    const [a, b, c] = RECHARGE_PACK_AMOUNTS;
    expect(fee).toContain(`WHEN p_need <= ${a} THEN ${a} WHEN p_need <= ${b} THEN ${b} ELSE ${c}`);
  });
  it("the top-up function accepts exactly the app's packs", () => {
    const fn = read("functions/create-wallet-topup-order/index.ts");
    expect(fn).toContain(`const PACKS = [${RECHARGE_PACK_AMOUNTS.join(", ")}];`);
  });
  it.each(["create-wallet-topup-order", "razorpay-webhook", "verify-wallet-payment"])(
    "the deployable copy of %s is the proposal (only the header differs)",
    (name) => {
      // Code from the first import on; line endings ignored (Windows checkouts have CRLF).
      const code = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n").replace(/^[\s\S]*?(?=\/\/ @ts-expect-error|import )/, "")
        .replace(/^\/\/ (PROPOSAL, NOT DEPLOYED\.|Originally:)/m, "");
      const root = resolve(__dirname, "../../../../supabase");
      expect(code(resolve(root, "functions", name, "index.ts"))).toBe(code(resolve(root, "proposals/functions", name, "index.ts")));
    },
  );
  it("posts the fee as a negative ledger entry exactly once per booking", () => {
    expect(fee).toContain("'cash_fee', -v_charged, 'fee:' || b.id::text");
  });
  it("uses the same launch period (10 jobs or 1 month)", () => {
    expect(launch).toContain(`interval '${LAUNCH_PERIOD.months} months'`);
    expect(launch).toContain(`v_done < ${LAUNCH_PERIOD.jobs}`);
  });
});
