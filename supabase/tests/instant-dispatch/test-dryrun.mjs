// Runs supabase/dryrun/23 on a fresh live-like database with a pg_cron stand-in; checks it ran and saved nothing.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const repo = process.argv[2];
const here = new URL(".", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const dir = mkdtempSync(join(tmpdir(), "hf-dry-"));
const port = 55000 + Math.floor(Math.random() * 900);
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {}, onError: () => {} });
await server.initialise(); await server.start(); await server.createDatabase("hf");
const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "hf" }); await c.connect();
let ok = true;
try {
  await c.query(readFileSync(join(here, "stub.sql"), "utf8"));
  await c.query(`create schema cron; create table cron.job (jobid serial primary key, jobname text, schedule text, command text);
    create function cron.schedule(n text, s text, cmd text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, cmd) returning jobid $$;
    create function cron.unschedule(id bigint) returns boolean language sql as $$ delete from cron.job where jobid = id returning true $$;`);
  const res = await c.query(readFileSync(`${repo}/supabase/dryrun/23_instant_dispatch_DRYRUN.sql`, "utf8"));
  const rows = (Array.isArray(res) ? res : [res]).filter((r) => r.command === "SELECT" && r.rows.length).pop()?.rows[0];
  console.log("CHECK row:", JSON.stringify(rows));
  ok = rows?.offers_table === true && rows?.accept_function === true && rows?.tick_scheduled === true && /2,5,10/.test(rows?.rings_should_be_2_5_10);
  const left = (await c.query(`select to_regclass('public.booking_offers') t, (select count(*)::int from cron.job) jobs`)).rows[0];
  console.log("after ROLLBACK:", JSON.stringify(left));
  ok = ok && left.t === null && left.jobs === 0;
} catch (e) { console.log("ERROR", e.message); ok = false; }
finally { await c.end(); await server.stop(); rmSync(dir, { recursive: true, force: true }); }
console.log(ok ? "DRY RUN OK: ran fully, saved nothing" : "DRY RUN FAILED"); process.exit(ok ? 0 : 1);
