// Applies the proposals the LIVE project does not have yet, in order, to the STAGING project. Stops at the first failure.
// (Live status checked read-only on 2026-11-01. Proposals 20261124000000 and 20261124000001 are already in the copied structure.)
//   $env:STAGING_DB_URL = "postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
//   node apply-proposals.mjs            # all of them      |   node apply-proposals.mjs --from 22   # restart at a step
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LIVE_REF = "jviwwhjwtyneqrguumro";
const url = process.env.STAGING_DB_URL ?? "";
if (!url) { console.error("Set STAGING_DB_URL first (see supabase/staging/README.md)."); process.exit(2); }
if (url.includes(LIVE_REF)) { console.error(`REFUSED: that is the LIVE project (${LIVE_REF}).`); process.exit(3); }

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "dryrun");
const STEPS = [
  ["20261108 reviews fix", "apply_5_reviews_COMMIT.sql"],
  ["20261109 pro area for Nearest", "apply_6_provider_location_COMMIT.sql"],
  ["20261110 chat hardening", "apply_7_chat_hardening_COMMIT.sql"],
  ["20261111 delete account", "apply_8_delete_account_COMMIT.sql"],
  ["20261112 late-cancel limit", "apply_9_late_cancel_COMMIT.sql"],
  ["20261113000001 labour and shifting", "apply_11_labour_shifting_COMMIT.sql"],
  ["20261113000002 pros pick jobs and rates", "apply_13_provider_sub_items_COMMIT.sql"],
  ["20261114 fee 3%, holds, auto-close", "apply_12_fee_3pct_holds_COMMIT.sql"],
  ["20261118 requests stay open", "apply_17_requests_stay_open_COMMIT.sql"],
  ["20261119 daily labour", "apply_18_daily_labour_COMMIT.sql"],
  ["20261120 push notifications", "apply_19_push_notifications_COMMIT.sql"],
  ["20261121 push webhooks", "apply_20_push_webhooks_COMMIT.sql"],
  ["20261122 booking payment orders", "apply_21_booking_payment_orders_COMMIT.sql"],
  ["20261123 booking payment settlement", "apply_22_booking_payment_settlement_COMMIT.sql"],
  ["SECURITY A  20261125000000 hardening", "apply_25_security_hardening_COMMIT.sql"],
  ["SECURITY D  20261125000003 permissions", "apply_28_permissions_hardening_COMMIT.sql"],
  ["SECURITY E  20261125000004 booking integrity", "apply_29_booking_integrity_COMMIT.sql"],
  ["SECURITY B  20261125000001 KYC PAN encryption", "apply_26_kyc_pan_encryption_COMMIT.sql"],
  ["SECURITY C  20261125000002 drop plain PAN + Aadhaar", "apply_27_kyc_drop_plain_columns_COMMIT.sql"],
];

const fromIdx = process.argv.includes("--from") ? Number(process.argv[process.argv.indexOf("--from") + 1]) : 1;
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("set search_path = public, extensions");
let failed = false;
for (const [i, [label, file]] of STEPS.entries()) {
  const n = i + 1;
  if (n < fromIdx) continue;
  const path = join(dir, file);
  if (!existsSync(path)) { console.log(`${String(n).padStart(2)}. ${label}: FILE MISSING (${file})`); failed = true; break; }
  try {
    await client.query(readFileSync(path, "utf8"));
    console.log(`${String(n).padStart(2)}. ${label}: ok`);
  } catch (e) {
    try { await client.query("rollback"); } catch { /* nothing open */ }
    console.log(`${String(n).padStart(2)}. ${label}: FAILED\n      ${String(e.message).slice(0, 300)}\n      (fix this, then run: node apply-proposals.mjs --from ${n})`);
    failed = true;
    break;
  }
}
await client.end();
console.log(failed ? "\nStopped at the first failure." : "\nAll proposals applied to staging.");
process.exitCode = failed ? 1 : 0;
