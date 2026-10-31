// Applies the proposals the live project is missing, in the order that was tested on the staging project.
// Slice 1 = the 14 older proposals + security A, D, E (the order tested on staging). Slice 2 = KYC (B). The PAN script and proposal C (irreversible) are NOT here.
//
//   $env:LIVE_DB_URL = "postgresql://postgres.jviwwhjwtyneqrguumro:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
//   node rollout-live.mjs --slice 1 --check                                    # read-only: what is applied, what is pending
//   node rollout-live.mjs --slice 1 --apply --backup out/live-before-data.sql  # does it; refuses without a real backup file
// Each step runs in its own transaction (BEGIN ... COMMIT inside the file); it is skipped if already applied, checked afterwards,
// and the run STOPS at the first failure (earlier steps stay: each one is valid on its own). Rollback lines are at the end of each file.
import pg from "pg";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REFS = { live: "jviwwhjwtyneqrguumro", staging: "keukwovrtsenndtjejcp" };
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const has = (n) => process.argv.includes(n);
const target = arg("--target") ?? "live";
const slice = Number(arg("--slice"));
const apply = has("--apply");
const url = process.env.LIVE_DB_URL ?? "";

if (!REFS[target]) { console.error("--target must be live (default) or staging (only to test this script)."); process.exit(2); }
if (![1, 2].includes(slice)) { console.error("Say which part: --slice 1 or --slice 2 (see the top of this file)."); process.exit(2); }
if (!url) { console.error("Set LIVE_DB_URL first (see supabase/live/README.md)."); process.exit(2); }
const other = target === "live" ? REFS.staging : REFS.live;
if (!url.includes(REFS[target]) || url.includes(other)) {
  console.error(`REFUSED: LIVE_DB_URL must be the ${target} project (${REFS[target]}).`);
  process.exit(3);
}
if (apply && target === "live") {
  const b = arg("--backup");
  if (!b || !existsSync(b) || statSync(b).size < 5000) {
    console.error("REFUSED: take a backup first and pass it with --backup <file> (a file of at least 5 KB). Commands: supabase/live/README.md");
    process.exit(4);
  }
  console.log(`Backup found: ${b} (${Math.round(statSync(b).size / 1024)} KB)`);
}

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "dryrun");
const S1 = [
  ["20261108 reviews fix", "apply_5_reviews_COMMIT.sql", "exists (select 1 from pg_trigger where tgname = 'a_validate_review' and not tgisinternal)"],
  ["20261109 pro area for Nearest", "apply_6_provider_location_COMMIT.sql", "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'service_providers' and column_name = 'approx_latitude')"],
  ["20261110 chat hardening", "apply_7_chat_hardening_COMMIT.sql", "exists (select 1 from pg_proc where proname = 'chat_message_problem')"],
  ["20261111 delete account", "apply_8_delete_account_COMMIT.sql", "exists (select 1 from pg_proc where proname = 'anonymise_account')"],
  ["20261112 late-cancel limit", "apply_9_late_cancel_COMMIT.sql", "exists (select 1 from pg_trigger where tgname = 'a_enforce_instant_booking_pause' and not tgisinternal)"],
  ["20261113000001 labour and shifting", "apply_11_labour_shifting_COMMIT.sql", "exists (select 1 from public.services where slug = 'labour-shifting')"],
  ["20261113000002 pros pick jobs and rates", "apply_13_provider_sub_items_COMMIT.sql", "to_regclass('public.provider_sub_items') is not null"],
  ["20261114 fee 3%, holds, auto-close", "apply_12_fee_3pct_holds_COMMIT.sql", "to_regclass('public.wallet_holds') is not null"],
  ["20261118 requests stay open", "apply_17_requests_stay_open_COMMIT.sql", "exists (select 1 from pg_proc where proname = 'close_missed_requests')"],
  ["20261119 daily labour", "apply_18_daily_labour_COMMIT.sql", "exists (select 1 from public.services where slug = 'daily-labour')"],
  ["20261120 push notifications", "apply_19_push_notifications_COMMIT.sql", "to_regclass('public.push_tokens') is not null"],
  ["20261121 push webhooks", "apply_20_push_webhooks_COMMIT.sql", "exists (select 1 from pg_proc where proname = 'push_webhook')"],
  ["20261122 booking payment orders", "apply_21_booking_payment_orders_COMMIT.sql", "to_regclass('public.booking_payment_orders') is not null"],
  ["20261123 booking payment settlement", "apply_22_booking_payment_settlement_COMMIT.sql", "exists (select 1 from pg_proc where proname = 'record_booking_payment')"],
  ["SECURITY A  20261125000000 hardening", "apply_25_security_hardening_COMMIT.sql", "to_regprocedure('public.otp_rate_take(text,text[],integer,integer)') is not null and not exists (select 1 from pg_policies where tablename = 'service_providers' and policyname = 'public_read_providers')"],
  ["SECURITY D  20261125000003 permissions", "apply_28_permissions_hardening_COMMIT.sql", "not has_table_privilege('anon', 'public.bookings', 'select')"],
  ["SECURITY E  20261125000004 booking integrity", "apply_29_booking_integrity_COMMIT.sql", "exists (select 1 from pg_trigger where tgname = 'zz_guard_booking_insert')"],
];
const S2 = [
  ["SECURITY B  20261125000001 KYC PAN encryption", "apply_26_kyc_pan_encryption_COMMIT.sql", "to_regclass('public.kyc_access_log') is not null and exists (select 1 from information_schema.columns where table_name = 'provider_kyc' and column_name = 'pan_last4')"],
];
const steps = slice === 1 ? S1 : S2;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
try {
  await client.connect();
} catch (e) {
  console.error(`COULD NOT CONNECT: ${e.message}`);
  process.exit(5);
}
await client.query("set search_path = public, extensions");
const isApplied = async (sql) => (await client.query(`select (${sql}) as ok`)).rows[0].ok === true;

console.log(`${apply ? "APPLYING" : "CHECKING (read-only)"} slice ${slice} on ${target.toUpperCase()}\n`);
let failed = false, applied = 0, pending = 0;
for (const [i, [label, file, check]] of steps.entries()) {
  const n = String(i + 1).padStart(2);
  if (await isApplied(check)) { console.log(`${n}. ${label}: already applied`); continue; }
  pending++;
  if (!apply) { console.log(`${n}. ${label}: PENDING`); continue; }
  const path = join(dir, file);
  if (!existsSync(path)) { console.log(`${n}. ${label}: FILE MISSING ${file}`); failed = true; break; }
  try {
    await client.query(readFileSync(path, "utf8"));
    if (!(await isApplied(check))) throw new Error("ran without error, but its own check does not pass");
    applied++;
    console.log(`${n}. ${label}: applied and checked`);
  } catch (e) {
    try { await client.query("rollback"); } catch { /* none open */ }
    console.log(`${n}. ${label}: FAILED\n      ${String(e.message).slice(0, 300)}\n      Nothing after this step was run. Tell Claude the message above.`);
    failed = true;
    break;
  }
}
await client.end();
if (!apply) console.log(`\n${pending} step(s) pending. Nothing was changed.`);
else console.log(failed ? "\nSTOPPED at the first failure." : `\nDone: ${applied} applied.`);
if (apply && !failed && slice === 1) console.log("\nNext: Claude deploys the hardened functions to live (needs step 'SECURITY A'), then you test the apps.");
if (apply && !failed && slice === 2) console.log("\nNext: deploy kyc-pan, kyc-admin-reveal-pan, kyc-retention to live, release the new Pro app + admin site, test a full identity check.");
process.exitCode = failed ? 1 : 0;
