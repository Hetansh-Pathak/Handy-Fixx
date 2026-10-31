// Creates ready-to-use TEST accounts on the STAGING project (never live). Safe to re-run: existing emails are reused.
//   $env:STAGING_DB_URL = "postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
//   $env:STAGING_ANON_KEY = "<staging anon key>"
//   node seed-test-users.mjs
import pg from "pg";
import { writeFileSync } from "node:fs";

const LIVE_REF = "jviwwhjwtyneqrguumro", REF = "keukwovrtsenndtjejcp";
const dbUrl = process.env.STAGING_DB_URL ?? "", anon = process.env.STAGING_ANON_KEY ?? "";
if (!dbUrl || !anon) { console.error("Set STAGING_DB_URL and STAGING_ANON_KEY first."); process.exit(2); }
if (dbUrl.includes(LIVE_REF)) { console.error("REFUSED: that is the LIVE project."); process.exit(3); }
const API = `https://${REF}.supabase.co`;
const PASSWORD = "Test1234!";

async function auth(path, body) {
  const r = await fetch(`${API}/auth/v1/${path}`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function ensureUser(email, data) {
  await auth("signup", { email, password: PASSWORD, ...(data ? { data } : {}) });
  const si = await auth("token?grant_type=password", { email, password: PASSWORD });
  if (!si.json.user) throw new Error(`could not sign in ${email}: ${JSON.stringify(si.json).slice(0, 140)}`);
  return si.json.user.id;
}

const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (sql, p) => (await db.query(sql, p)).rows;
const services = (await q(`select array_agg(id) ids from public.services where is_active`))[0].ids;

const lines = [];
const customer = await ensureUser("customer1@example.com", { handyfix_role: "customer", full_name: "Test Customer" });
await q(`insert into public.customer_email_verifications (user_id, email) values ($1, 'customer1@example.com') on conflict (user_id) do nothing`, [customer]);
await q(`insert into public.profiles (user_id, full_name, phone, city, pincode) values ($1, 'Test Customer', '9000000001', 'Jamnagar', '361001') on conflict do nothing`, [customer]);
lines.push("customer1@example.com   (customer; email already verified)");

const pro = async (email, name, phone, withGps) => {
  const uid = await ensureUser(email);
  const existing = await q(`select id from public.service_providers where user_id = $1`, [uid]);
  let spId = existing[0]?.id;
  if (!spId) {
    spId = (await q(
      `insert into public.service_providers (user_id, full_name, first_name, last_name, phone, email, status, kyc_status, kyc_reviewed_at, is_online, is_verified, rating, date_of_birth, pincodes, service_ids, bank_account_name)
       values ($1,$2,$3,'Test',$4,$5,'active','approved', now() - interval '60 days', true, true, 4.5, '1990-01-01', ARRAY['Jamnagar','361001'], $6, $2) returning id`,
      [uid, name, name.split(" ")[0], phone, email, services]))[0].id;
    await q(`insert into public.wallet_transactions (provider_id, type, amount, idempotency_key, note) values ($1,'topup',500,$2,'staging seed') on conflict do nothing`, [spId, `seed:${spId}`]);
  }
  if (withGps) await q(`insert into public.provider_presence (provider_id, latitude, longitude, accuracy_m) values ($1, 22.4710, 70.0580, 20) on conflict (provider_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, updated_at = now()`, [spId]);
  lines.push(`${email.padEnd(24)} (approved pro, wallet Rs 500, ${withGps ? "has a GPS position in Jamnagar" : "NO GPS position: service area Jamnagar only"})`);
  return spId;
};
await pro("pro1@example.com", "Ravi Test", "9000000011", true);
await pro("pro2@example.com", "Meena Test", "9000000012", false);

const admin = await ensureUser("admin1@example.com");
await q(`insert into public.user_roles (user_id, role) values ($1,'admin') on conflict do nothing`, [admin]);
await q(`insert into public.admin_users (user_id, full_name, email, role) select $1, 'Test Admin', 'admin1@example.com', 'admin' where not exists (select 1 from public.admin_users where user_id = $1)`, [admin]);
lines.push("admin1@example.com      (admin)");
await db.end();

const text = `Staging test accounts. Password for all: ${PASSWORD}\n${lines.join("\n")}\n`;
writeFileSync(new globalThis.URL("out/staging-accounts.txt", import.meta.url), text);
console.log(text);
