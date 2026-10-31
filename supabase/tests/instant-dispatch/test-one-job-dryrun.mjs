// Runs supabase/dryrun/30 (must show every check true and save nothing) and apply_30 (must save) on a fresh live-like database.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const repo = process.argv[2];
const here = new URL(".", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const dir = mkdtempSync(join(tmpdir(), "hf-dry30-"));
const port = 56000 + Math.floor(Math.random() * 900);
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {}, onError: () => {} });
await server.initialise(); await server.start(); await server.createDatabase("hf");
const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "hf" }); await c.connect();
let ok = true;
const lastRow = (res) => (Array.isArray(res) ? res : [res]).filter((r) => r.command === "SELECT" && r.rows.length).pop()?.rows[0];
const present = async () => (await c.query(`select exists (select 1 from pg_trigger where tgname = 'enforce_one_job_at_a_time') t`)).rows[0].t;
try {
  await c.query(readFileSync(join(here, "stub.sql"), "utf8"));
  await c.query(`alter table services add column if not exists duration_minutes int default 60`);
  for (const f of ["20261124000000_instant_dispatch", "20261124000001_dispatch_service_area"]) await c.query(readFileSync(`${repo}/supabase/proposals/${f}_PROPOSAL_NOT_APPLIED.sql`, "utf8"));
  const row = lastRow(await c.query(readFileSync(`${repo}/supabase/dryrun/30_one_job_at_a_time_DRYRUN.sql`, "utf8")));
  console.log("CHECK row:", JSON.stringify(row));
  ok = !!row && Object.values(row).every((v) => v === true);
  const afterDry = await present();
  console.log("after ROLLBACK, trigger present:", afterDry);
  ok = ok && afterDry === false;
  await c.query(readFileSync(`${repo}/supabase/dryrun/apply_30_one_job_at_a_time_COMMIT.sql`, "utf8"));
  const afterApply = await present();
  console.log("after COMMIT, trigger present:", afterApply);
  ok = ok && afterApply === true;
} catch (e) { console.log("ERROR", e.message); ok = false; }
finally { await c.end(); await server.stop(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* Windows */ } }
console.log(ok ? "DRY RUN OK: every check true, saved nothing; COMMIT file saves" : "DRY RUN FAILED"); process.exit(ok ? 0 : 1);
