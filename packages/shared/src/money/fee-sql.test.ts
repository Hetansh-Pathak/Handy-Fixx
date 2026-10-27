import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FEE_HIGH, FEE_LOW, FEE_MID, SLAB_HIGH_ABOVE, SLAB_MID_FROM } from "./fee";
import { LAUNCH_PERIOD } from "./launch";

// Guards against the TypeScript rules and the proposed SQL drifting apart.
const sql = readFileSync(
  resolve(__dirname, "../../../../supabase/proposals/20261102000001_provider_wallet_fee_PROPOSAL_NOT_APPLIED.sql"),
  "utf8",
);

describe("proposed SQL matches the shared fee rules", () => {
  it("uses the same flat slabs", () => {
    expect(sql).toContain(`WHEN p_bill < ${SLAB_MID_FROM} THEN ${FEE_LOW}`);
    expect(sql).toContain(`WHEN p_bill <= ${SLAB_HIGH_ABOVE} THEN ${FEE_MID}`);
    expect(sql).toContain(`ELSE ${FEE_HIGH}`);
  });
  it("uses the same launch period (3 months or 10 jobs)", () => {
    expect(sql).toContain(`interval '${LAUNCH_PERIOD.months} months'`);
    expect(sql).toContain(`v_done < ${LAUNCH_PERIOD.jobs}`);
  });
  it("posts the fee as a negative ledger entry exactly once per booking", () => {
    expect(sql).toContain("'cash_fee', -v_slab, 'fee:' || b.id::text");
  });
});
