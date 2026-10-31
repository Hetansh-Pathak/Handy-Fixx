import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUSY_MESSAGE, BUSY_STATUSES, DEFAULT_JOB_MINUTES, TRAVEL_BUFFER_MINUTES } from "./provider-busy";

// The database twin of the rule (proposal 20261126000000). Its behaviour is tested on a real throwaway Postgres:
// supabase/tests/instant-dispatch/test-one-job.mjs (38 checks, including two sessions accepting at the same moment).
const sql = readFileSync(resolve(__dirname, "../../../../supabase/proposals/20261126000000_one_job_at_a_time_PROPOSAL_NOT_APPLIED.sql"), "utf8");

describe("one-job SQL matches the shared rule", () => {
  it("same busy statuses", () => {
    expect(sql).toContain(`IN (${BUSY_STATUSES.map((s) => `'${s}'`).join(", ")})`);
  });
  it("same travel buffer and default duration", () => {
    expect(sql).toContain(`COALESCE(NULLIF(s.duration_minutes, 0), ${DEFAULT_JOB_MINUTES}) + ${TRAVEL_BUFFER_MINUTES}`);
    expect(sql).toContain(`COALESCE(NULLIF(p_minutes, 0), ${DEFAULT_JOB_MINUTES}) + ${TRAVEL_BUFFER_MINUTES}`);
  });
  it("same message, raised as P0001", () => {
    expect(sql).toContain(`RAISE EXCEPTION '${BUSY_MESSAGE}' USING ERRCODE = 'P0001'`);
  });
  it("one accept at a time per pro: an advisory lock before the check", () => {
    expect(sql.indexOf("pg_advisory_xact_lock(hashtext('busy:'")).toBeGreaterThan(-1);
    expect(sql.indexOf("pg_advisory_xact_lock(hashtext('busy:'")).toBeLessThan(sql.indexOf("IF public.provider_busy_conflict(NEW.provider_id, NEW.id)"));
  });
  it("busy pros are skipped when offers are created", () => {
    expect(sql).toContain("AND public.provider_busy_conflict(sp.id, b.id) IS NULL");
  });
});
