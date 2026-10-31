// Applies SQL to the STAGING project. It refuses to run against the live project.
//   $env:STAGING_DB_URL = "postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
//   node apply-sql.mjs out/schema.json            # the copy of the live structure: one statement at a time, failures are listed
//   node apply-sql.mjs ../dryrun/apply_26_kyc_pan_encryption_COMMIT.sql   # a normal apply file: as one transaction
// The password stays in your shell; nothing here prints it.
import pg from "pg";
import { readFileSync } from "node:fs";

const LIVE_REF = "jviwwhjwtyneqrguumro";
const url = process.env.STAGING_DB_URL ?? "";
const file = process.argv[2];
if (!url || !file) {
  console.error("Usage: set STAGING_DB_URL, then: node apply-sql.mjs <file.json | file.sql>");
  process.exit(2);
}
if (url.includes(LIVE_REF)) {
  console.error(`REFUSED: that connection string is the LIVE project (${LIVE_REF}). Use the handyfix-staging one.`);
  process.exit(3);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const who = (await client.query("select current_database() db, inet_server_addr()::text addr")).rows[0];
console.log(`Connected to ${who.db}. Applying ${file}`);

try {
  if (file.endsWith(".json")) {
    const { statements } = JSON.parse(readFileSync(file, "utf8"));
    const failures = [];
    let done = 0;
    for (const [i, sql] of statements.entries()) {
      try {
        await client.query(sql);
        done++;
      } catch (e) {
        failures.push({ n: i + 1, message: String(e.message).slice(0, 220), sql: sql.replace(/\s+/g, " ").slice(0, 110) });
      }
      if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${statements.length}`);
    }
    console.log(`\nDone: ${done} of ${statements.length} statements worked, ${failures.length} failed.`);
    for (const f of failures.slice(0, 60)) console.log(`  #${f.n}: ${f.message}\n      ${f.sql}`);
    if (failures.length > 60) console.log(`  ... and ${failures.length - 60} more`);
    process.exitCode = failures.length ? 1 : 0;
  } else {
    await client.query(readFileSync(file, "utf8"));
    console.log("Done: the file ran without error.");
  }
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
