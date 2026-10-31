// End-to-end security checks against the STAGING project (real Supabase Auth, real Edge Functions on Deno, real RLS).
// It creates throwaway test accounts (e2e-*@example.com) and test rows on staging; it refuses the live project.
//   $env:STAGING_DB_URL = "postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
//   $env:STAGING_ANON_KEY = "<the staging anon key>"      (public by design; Project Settings > API)
//   node e2e-security.mjs
import pg from "pg";
import { readFileSync } from "node:fs";

const LIVE_REF = "jviwwhjwtyneqrguumro";
const REF = "keukwovrtsenndtjejcp";
const dbUrl = process.env.STAGING_DB_URL ?? "";
const anon = process.env.STAGING_ANON_KEY ?? "";
if (!dbUrl || !anon) { console.error("Set STAGING_DB_URL and STAGING_ANON_KEY first."); process.exit(2); }
if (dbUrl.includes(LIVE_REF)) { console.error("REFUSED: that is the LIVE project."); process.exit(3); }
const URL = `https://${REF}.supabase.co`;
const secrets = Object.fromEntries(readFileSync(new globalThis.URL("out/staging-secrets.env", import.meta.url), "utf8").trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  " + extra}`); };

const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (sql, p) => (await db.query(sql, p)).rows;

async function auth(path, body) {
  const r = await fetch(`${URL}/auth/v1/${path}`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function user(label) {
  const email = `e2e-${label}-${Date.now()}@example.com`, password = "E2e-Test-Pass-123";
  const up = await auth("signup", { email, password });
  const si = await auth("token?grant_type=password", { email, password });
  if (!si.json.access_token) throw new Error(`sign-in failed for ${label}: ${up.status} ${JSON.stringify(si.json).slice(0, 160)}`);
  return { email, id: si.json.user.id, token: si.json.access_token };
}
const call = (path, token, opts = {}) => fetch(`${URL}${path}`, { ...opts, headers: { apikey: anon, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", ...(opts.headers ?? {}) } });
const fn = async (name, token, body, headers = {}) => { const r = await call(`/functions/v1/${name}`, token, { method: "POST", body: JSON.stringify(body), headers }); return { status: r.status, text: await r.clone().text(), json: await r.json().catch(() => ({})), headers: r.headers }; };

try {
  // ── accounts ──
  const [p1, p2, admin, cust] = [await user("pro1"), await user("pro2"), await user("admin"), await user("customer")];
  const mkPro = async (u, name, phone) => (await q(
    `insert into public.service_providers (user_id, full_name, first_name, last_name, phone, email, status, kyc_status, date_of_birth, pincodes, service_ids, bank_account_name)
     values ($1,$2,$3,'Patel',$4,$5,'active','not_submitted','1990-01-01', ARRAY['Jamnagar'], (select array_agg(id) from (select id from public.services limit 1) s), $2) returning id`, [u.id, name, name.split(" ")[0], phone, u.email]))[0].id;
  p1.sp = await mkPro(p1, "Ravi Patel", "9825012345");
  p2.sp = await mkPro(p2, "Meena Shah", "9825012346");
  await q(`insert into public.user_roles values ($1,'admin')`, [admin.id]);
  await q(`insert into public.customer_email_verifications (user_id, email) values ($1, $2)`, [cust.id, cust.email]);
  console.log("test accounts ready (pro1, pro2, admin, customer)\n");

  // ── KYC: PAN saved only by the server function ──
  const noLogin = await fn("kyc-pan", null, { action: "save", pan: "ABCDE1234F" });
  check("kyc-pan: refuses a caller with no login", noLogin.status === 401, String(noLogin.status));
  const bad = await fn("kyc-pan", p1.token, { action: "save", pan: "NOT-A-PAN" });
  check("kyc-pan: refuses a malformed PAN", bad.status === 400, `${bad.status} ${bad.text.slice(0, 80)}`);
  const save = await fn("kyc-pan", p1.token, { action: "save", pan: "abcde 1234 f" });
  check("kyc-pan: saves a PAN typed with spaces and lower case; the answer is only the last 4 characters", save.status === 200 && save.json.pan_last4 === "234F" && !save.text.includes("ABCDE"), `${save.status} ${save.text.slice(0, 100)}`);
  const row = (await q(`select pan_encrypted, pan_nonce, pan_key_version, pan_last4, pan_blind_index, row_to_json(k)::text as whole from public.provider_kyc k where provider_id = $1`, [p1.sp]))[0];
  check("database: the PAN is stored encrypted (AES-256-GCM: 12-byte nonce, key version 1) with a 64-hex blind index", !!row && Buffer.from(row.pan_nonce, "base64").length === 12 && row.pan_key_version === 1 && /^[0-9a-f]{64}$/.test(row.pan_blind_index) && row.pan_last4 === "234F");
  check("database: the plain PAN appears nowhere in the stored row", !!row && !row.whole.includes("ABCDE1234F") && !row.whole.includes("ABCDE"));
  const second = await fn("kyc-pan", p2.token, { action: "save", pan: "ABCDE1234F" });
  check("kyc-pan: the same PAN on a second account is refused (duplicate detection through the blind index)", second.status === 409, `${second.status} ${second.text.slice(0, 80)}`);
  const other = await fn("kyc-pan", p2.token, { action: "save", pan: "VWXYZ5678K" });
  check("kyc-pan: a different PAN on the second account works", other.status === 200 && other.json.pan_last4 === "678K");

  // ── what the apps can read through the normal API ──
  const rl = await call("/rest/v1/provider_kyc?select=pan_last4,selfie_path", p1.token);
  const rlj = await rl.json();
  check("API: the pro reads only their own KYC row, with the last 4 characters", rl.status === 200 && rlj.length === 1 && rlj[0].pan_last4 === "234F", JSON.stringify(rlj).slice(0, 100));
  for (const col of ["pan_encrypted", "pan_blind_index", "pan_nonce"]) {
    const r = await call(`/rest/v1/provider_kyc?select=${col}`, p1.token);
    check(`API: the pro cannot read provider_kyc.${col}`, r.status === 401 || r.status === 403 || r.status === 400, String(r.status));
  }
  const write = await call(`/rest/v1/provider_kyc?provider_id=eq.${p1.sp}`, p1.token, { method: "PATCH", body: JSON.stringify({ pan_encrypted: "x" }) });
  check("API: the pro cannot write the PAN columns", write.status >= 400, String(write.status));
  const anonKyc = await call("/rest/v1/provider_kyc?select=provider_id", null);
  check("API: a signed-out visitor cannot read provider_kyc", anonKyc.status >= 400, String(anonKyc.status));
  const anonPros = await call("/rest/v1/service_providers?select=phone,bank_account_number", null);
  const anonProsBody = await anonPros.text();
  check("API: a signed-out visitor cannot read pros' phone and bank details (the live hole C1)", anonPros.status >= 400 || anonProsBody === "[]", `${anonPros.status} ${anonProsBody.slice(0, 80)}`);
  const confirm = await call("/rest/v1/rpc/confirm_user_email", cust.token, { method: "POST", body: JSON.stringify({ user_email: "someone@example.com" }) });
  check("API: a signed-in user cannot call confirm_user_email (the live hole C2)", confirm.status >= 400, String(confirm.status));

  // ── admin reveal ──
  const asPro = await fn("kyc-admin-reveal-pan", p1.token, { provider_id: p1.sp, reason: "curious" });
  check("kyc-admin-reveal-pan: a pro cannot use it", asPro.status === 403, String(asPro.status));
  const noReason = await fn("kyc-admin-reveal-pan", admin.token, { provider_id: p1.sp });
  check("kyc-admin-reveal-pan: an admin must give a reason", noReason.status === 400, String(noReason.status));
  const reveal = await fn("kyc-admin-reveal-pan", admin.token, { provider_id: p1.sp, reason: "support ticket 42" });
  check("kyc-admin-reveal-pan: an admin with a reason gets the full PAN, not cacheable", reveal.status === 200 && reveal.json.pan === "ABCDE1234F" && (reveal.headers.get("cache-control") ?? "").includes("no-store"), `${reveal.status} ${reveal.text.slice(0, 60)}`);
  const log = await q(`select action, detail, actor_id from public.kyc_access_log where provider_id = $1`, [p1.sp]);
  check("kyc_access_log: that view is recorded with who, which pro and why", log.length === 1 && log[0].action === "view_pan" && log[0].actor_id === admin.id && log[0].detail === "support ticket 42", JSON.stringify(log));
  const noPan = await fn("kyc-admin-reveal-pan", admin.token, { provider_id: "00000000-0000-0000-0000-000000000000", reason: "check" });
  check("kyc-admin-reveal-pan: an unknown provider gives 404 and no log row", noPan.status === 404 && (await q(`select count(*)::int n from public.kyc_access_log`))[0].n === 1);

  // ── retention function guard ──
  const r1 = await fn("kyc-retention", null, {});
  const r2 = await fn("kyc-retention", null, {}, { "x-retention-secret": "wrong".repeat(10) });
  const r3 = await fn("kyc-retention", null, {}, { "x-retention-secret": secrets.KYC_RETENTION_SECRET });
  check("kyc-retention: refuses without the secret and with a wrong secret", r1.status === 401 && r2.status === 401, `${r1.status} ${r2.status}`);
  check("kyc-retention: runs with the right secret (nothing due yet)", r3.status === 200 && r3.json.ok === true, `${r3.status} ${r3.text.slice(0, 80)}`);

  // ── submit KYC without Aadhaar ──
  await call(`/rest/v1/provider_kyc?provider_id=eq.${p1.sp}`, p1.token, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ selfie_path: `${p1.id}/selfie_1.jpg`, pan_path: `${p1.id}/pan_1.jpg`, consent_accepted_at: new Date().toISOString(), terms_version: "v1.3" }) });
  const prep = await fn("kyc-pan", p1.token, { action: "prepare_submit" });
  const sub = await call("/rest/v1/rpc/submit_kyc", p1.token, { method: "POST", body: "{}" });
  const subj = await sub.json();
  check("submit_kyc: PAN + selfie + PAN photo + consent are enough, no Aadhaar needed", prep.status === 200 && sub.status === 200 && subj?.success === true, `${prep.status} ${sub.status} ${JSON.stringify(subj).slice(0, 100)}`);
  check("the application moves to 'pending' review", (await q(`select kyc_status from public.service_providers where id = $1`, [p1.sp]))[0].kyc_status === "pending");

  // ── booking integrity (proposal E) through the real API ──
  const svc = (await q(`select id from public.services limit 1`))[0].id;
  const mk = (extra) => call("/rest/v1/bookings", cust.token, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ customer_id: cust.id, service_id: svc, address: "1 MG Road", status: "pending", ...extra }) });
  const good = await mk({ total_amount: 1 });
  const gj = await good.json();
  check("booking: a normal booking works and the catalogue price is forced (the customer's number is ignored)", good.status === 201 && Number(gj[0].total_amount) > 1, `${good.status} ${JSON.stringify(gj).slice(0, 100)}`);
  const done = await mk({ status: "completed" });
  check("booking: a booking created already 'completed' is refused (the live hole W1)", done.status >= 400, String(done.status));
  const paid = await mk({ payment_status: "paid" });
  const pj = await paid.json();
  check("booking: a forged payment_status is reset to unpaid", paid.status === 201 && pj[0].payment_status === "unpaid", `${paid.status} ${pj[0]?.payment_status}`);
  const other2 = await call("/rest/v1/bookings", cust.token, { method: "POST", body: JSON.stringify({ customer_id: p1.id, user_id: cust.id, service_id: svc, address: "x" }) });
  check("booking: a booking under someone else's account is refused (the live hole M8)", other2.status >= 400, String(other2.status));
  const mine = await call("/rest/v1/bookings?select=id", p2.token);
  check("booking: another user sees none of this customer's bookings", (await mine.json()).length === 0);
} catch (e) {
  check("the end-to-end run crashed", false, e.stack ?? String(e));
} finally {
  await db.end();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
