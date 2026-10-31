// Backup of the DATA in the public schema, with no Docker: every table's rows go into one JSON file. Read-only.
//   $env:LIVE_DB_URL = "postgresql://postgres.jviwwhjwtyneqrguumro:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
//   node backup-data.mjs                 # writes out/live-before-data.json
// Restore one table later with:  insert into public.<table> select * from jsonb_populate_recordset(null::public.<table>, '<its rows>'::jsonb);
// (The structure is saved separately: out/live-before-structure.sql. Uploaded photos are not part of a database backup.)
import pg from "pg";
import { mkdirSync, writeFileSync, statSync } from "node:fs";

const REFS = { live: "jviwwhjwtyneqrguumro", staging: "keukwovrtsenndtjejcp" };
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const target = arg("--target") ?? "live";
const out = arg("--out") ?? "out/live-before-data.json";
const url = process.env.LIVE_DB_URL ?? "";
if (!REFS[target]) { console.error("--target must be live (default) or staging (to test this script)."); process.exit(2); }
if (!url) { console.error("Set LIVE_DB_URL first."); process.exit(2); }
const other = target === "live" ? REFS.staging : REFS.live;
if (!url.includes(REFS[target]) || url.includes(other)) { console.error(`REFUSED: LIVE_DB_URL must be the ${target} project (${REFS[target]}).`); process.exit(3); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
try { await client.connect(); } catch (e) { console.error(`COULD NOT CONNECT: ${e.message}`); process.exit(5); }
await client.query("begin read only isolation level repeatable read");
const tables = (await client.query(
  `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') order by 1`)).rows.map((r) => r.relname);
const data = {};
const counts = [];
for (const t of tables) {
  const rows = (await client.query(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as j from public."${t}" x`)).rows[0].j;
  data[t] = rows;
  counts.push([t, rows.length]);
}
await client.query("rollback");
await client.end();
mkdirSync(out.includes("/") ? out.slice(0, out.lastIndexOf("/")) : ".", { recursive: true });
writeFileSync(out, JSON.stringify({ taken_at: new Date().toISOString(), project: target, tables: data }));
console.log(`Backup written: ${out} (${Math.round(statSync(out).size / 1024)} KB), ${tables.length} tables, ${counts.reduce((a, [, n]) => a + n, 0)} rows`);
console.log(counts.filter(([, n]) => n > 0).map(([t, n]) => `  ${t}: ${n}`).join("\n"));
