// Security proposals (20261125*) on a REAL throwaway Postgres 17 (embedded-postgres, deleted afterwards):
// live-like stub + each proposal applied twice (re-run safe) + the attacks each one must stop.
// Usage: node test-security.mjs <repo>
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.argv[2];
const here = new URL(".", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const P = (name) => readFileSync(`${repo}/supabase/proposals/${name}`, "utf8");
const PROPOSAL_A = "20261125000000_security_hardening_PROPOSAL_NOT_APPLIED.sql";

const results = [];
export const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  " + extra}`);
};

/** Starts a fresh database with the stub loaded; returns helpers and a stop function. */
async function freshDb(label) {
  const dir = mkdtempSync(join(tmpdir(), `hf-sec-${label}-`));
  const port = 56000 + Math.floor(Math.random() * 900);
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  await server.createDatabase("hf");
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "hf" });
  await c.connect();
  c.on("error", () => {});
  await c.query(readFileSync(join(here, "stub.sql"), "utf8"));
  const q = async (sql, params) => (await c.query(sql, params)).rows;
  /** Runs `sql` as a Supabase role (anon / authenticated / service_role) with auth.uid() = uid; always rolled back. */
  const as = async (role, uid, sql, params, keep = false) => {
    await c.query("begin");
    let ok = false;
    try {
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
      await c.query(`set local role ${role}`);
      const r = await c.query(sql, params);
      ok = true;
      return { rows: r.rows, count: r.rowCount, error: null };
    } catch (e) {
      return { rows: [], count: 0, error: e };
    } finally {
      await c.query(keep && ok ? "commit" : "rollback");
    }
  };
  const stop = async () => {
    await c.end();
    await server.stop();
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* Windows may hold the folder a moment; it is in the temp folder */ }
  };
  return { c, q, as, stop };
}

const denied = (r) => r.error !== null && /permission denied|row-level security|violates row-level/i.test(r.error.message);

// ── seed shared by the suites ─────────────────────────────────────────────────────────────────────────────────────────
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ids = {
  admin: U(1), proA: U(11), proB: U(12), proDraft: U(13), customer: U(21),
  spA: U(111), spB: U(112), spDraft: U(113),
};
async function seed(q) {
  await q(`insert into auth.users (id, email) values ($1,'admin@x.in'),($2,'a@x.in'),($3,'b@x.in'),($4,'d@x.in'),($5,'c@x.in')`,
    [ids.admin, ids.proA, ids.proB, ids.proDraft, ids.customer]);
  await q(`insert into public.user_roles values ($1,'admin')`, [ids.admin]);
  await q(`insert into public.service_providers (id,user_id,full_name,phone,email,bank_account_number,upi_id,kyc_status,status,is_online)
           values ($1,$2,'Pro A','9000000001','a@x.in','1234567890','a@upi','approved','active',true),
                  ($3,$4,'Pro B','9000000002','b@x.in','2222222222','b@upi','pending','active',false),
                  ($5,$6,'Pro Draft','9000000003','d@x.in',null,null,'not_submitted','active',false)`,
    [ids.spA, ids.proA, ids.spB, ids.proB, ids.spDraft, ids.proDraft]);
  await q(`insert into public.provider_otp_codes (provider_id,email,otp_code,expires_at) values ($1,'a@x.in','123456', now() + interval '5 minutes')`, [ids.spA]);
  await q(`insert into storage.objects (bucket_id, name) values ('provider-kyc', $1), ('provider-kyc', $2)`,
    [`${ids.proB}/selfie_1.jpg`, `${ids.proDraft}/selfie_1.jpg`]);
}

// ── Proposal A ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function suiteA() {
  const { q, as, stop } = await freshDb("a");
  try {
    await seed(q);
    const before = await as("anon", null, `select count(*)::int n from public.service_providers`);
    check("A0 live-like stub reproduces C1 (anon reads every pro's bank details before the fix)", before.rows[0]?.n === 3);

    await q(P(PROPOSAL_A));
    await q(P(PROPOSAL_A));
    check("A1 proposal A applies and re-runs safely", true);

    // C2
    const c2a = await as("anon", null, `select public.confirm_user_email('a@x.in')`);
    const c2b = await as("authenticated", ids.customer, `select public.confirm_user_email('a@x.in')`);
    check("A2 confirm_user_email: anon cannot call it", denied(c2a), c2a.error?.message);
    check("A3 confirm_user_email: a signed-in user cannot call it", denied(c2b), c2b.error?.message);
    const owner = await q(`select has_function_privilege('postgres', 'public.confirm_user_email(text)', 'execute') ok`);
    check("A4 confirm_user_email: the database owner still can (nothing else breaks)", owner[0].ok === true);

    // C1
    const anonRows = await as("anon", null, `select id from public.service_providers`);
    const custRows = await as("authenticated", ids.customer, `select id, bank_account_number from public.service_providers`);
    const ownRows = await as("authenticated", ids.proA, `select id from public.service_providers`);
    const adminRows = await as("authenticated", ids.admin, `select id from public.service_providers`);
    const view = await as("anon", null, `select id from public.public_providers`);
    check("A5 C1: anon reads no pro rows", anonRows.count === 0 && !anonRows.error, anonRows.error?.message);
    check("A6 C1: a customer reads no pro rows (no bank details)", custRows.count === 0 && !custRows.error);
    check("A7 C1: a pro still reads their own row", ownRows.count === 1 && ownRows.rows[0].id === ids.spA);
    check("A8 C1: an admin still reads every row", adminRows.count === 3);
    check("A9 C1: the public_providers view still lists approved pros", view.count === 1 && view.rows[0].id === ids.spA);

    // C3
    const plain = await q(`select count(*)::int n from public.provider_otp_codes where otp_code is not null`);
    check("A10 C3: no plain OTP code is left", plain[0].n === 0);
    const readOtp = await as("authenticated", ids.proA, `select * from public.provider_otp_codes`);
    const writeOtp = await as("authenticated", ids.proA,
      `insert into public.provider_otp_codes (provider_id,email,code_hash,salt,expires_at) values ($1,'evil@x.in','h','s', now() + interval '1 hour')`, [ids.spA]);
    check("A11 C3: a pro can no longer read OTP rows", denied(readOtp), readOtp.error?.message);
    check("A12 C3: a pro can no longer insert their own OTP row (the bypass)", denied(writeOtp), writeOtp.error?.message);
    const helper = await as("authenticated", ids.proA, `select public.provider_otp_take_attempt($1, 5)`, [ids.spA]);
    check("A13 C3: OTP helpers are service-role only", denied(helper), helper.error?.message);

    // otp_rate_take
    const rate = async (keys, max = 2) => (await q(`select public.otp_rate_take('t:x', $1::text[], 60, $2) w`, [keys, max]))[0].w;
    const r1 = await rate(["k1"]), r2 = await rate(["k1"]), r3 = await rate(["k1"]), r4 = await rate(["k2"]);
    check("A14 rate limit: allows up to the max, then returns seconds to wait", r1 === 0 && r2 === 0 && r3 > 0 && r3 <= 60, `${r1},${r2},${r3}`);
    check("A15 rate limit: other keys are independent", r4 === 0);
    const r5 = await rate(["k2", "k1"]);
    const k2count = (await q(`select count(*)::int n from public.otp_rate_events where key_hash = 'k2'`))[0].n;
    check("A16 rate limit: a blocked multi-key call records nothing", r5 > 0 && k2count === 1, `${r5},${k2count}`);

    // attempts / lock / expiry / single use
    await q(`insert into public.provider_otp_codes (provider_id,email,code_hash,salt,expires_at) values ($1,'a@x.in','H','S', now() + interval '10 minutes')`, [ids.spA]);
    const take = async (sp) => (await q(`select * from public.provider_otp_take_attempt($1, 5)`, [sp]))[0];
    const tries = [];
    for (let i = 0; i < 6; i++) tries.push(await take(ids.spA));
    check("A17 OTP: 5 attempts are counted down (4..0)", tries.slice(0, 5).map((t) => t.attempts_left).join() === "4,3,2,1,0" && tries[0].status === "ok");
    check("A18 OTP: the 6th attempt is refused as locked", tries[5].status === "locked");
    await q(`insert into public.provider_otp_codes (provider_id,email,code_hash,salt,expires_at,created_at) values ($1,'b@x.in','H','S', now() - interval '1 minute', now() - interval '11 minutes')`, [ids.spB]);
    check("A19 OTP: an expired code is refused", (await take(ids.spB)).status === "expired");
    await q(`insert into public.provider_otp_codes (provider_id,email,code_hash,salt,expires_at) values ($1,'d@x.in','H','S', now() + interval '10 minutes')`, [ids.spDraft]);
    const live = await take(ids.spDraft);
    const once = (await q(`select public.provider_otp_consume($1) ok`, [live.otp_id]))[0].ok;
    const twice = (await q(`select public.provider_otp_consume($1) ok`, [live.otp_id]))[0].ok;
    check("A20 OTP: a right code works once (single use)", once === true && twice === false);
    check("A21 OTP: a used code is refused afterwards", (await take(ids.spDraft)).status === "used");
    const expiredConsume = await q(`select public.provider_otp_consume(id) ok from public.provider_otp_codes where provider_id = $1`, [ids.spB]);
    check("A22 OTP: an expired code cannot be consumed", expiredConsume[0].ok === false);

    // H1
    const booking = await as("authenticated", ids.customer,
      `insert into public.bookings (customer_id, provider_id, scheduled_date) values ($1, $2, current_date) returning id`, [ids.customer, ids.spA]);
    check("A23 H1: a customer can still book (the new-booking notice trigger works without the open policy)", !booking.error, booking.error?.message);
    const kept = await as("authenticated", ids.customer,
      `insert into public.bookings (customer_id, provider_id, scheduled_date) values ($1, $2, current_date) returning id`, [ids.customer, ids.spA], true);
    const notice = await q(`select count(*)::int n from public.provider_notifications where provider_id = $1 and data->>'booking_id' = $2`, [ids.spA, kept.rows[0]?.id ?? ""]);
    check("A23b H1: the trigger still writes the pro's new-booking notice", notice[0].n === 1, `${kept.error?.message ?? ""} n=${notice[0].n}`);
    const forge = await as("authenticated", ids.customer,
      `insert into public.provider_notifications (provider_id,type,title,message) values ($1,'system','Wallet blocked','Call 9999')`, [ids.spA]);
    const forgeAnon = await as("anon", null,
      `insert into public.provider_notifications (provider_id,type,title,message) values ($1,'system','x','x')`, [ids.spA]);
    const forgeCust = await as("authenticated", ids.proA, `insert into public.customer_notifications (user_id,title,message) values ($1,'x','x')`, [ids.customer]);
    check("A24 H1: a customer cannot write a notification to a pro", denied(forge), forge.error?.message);
    check("A25 H1: anon cannot write a notification", denied(forgeAnon), forgeAnon.error?.message);
    check("A26 H1: a pro cannot write a notification to a customer", denied(forgeCust), forgeCust.error?.message);

    // M1
    const delPending = await as("authenticated", ids.proB, `delete from storage.objects where name like $1 returning id`, [`${ids.proB}/%`]);
    const updPending = await as("authenticated", ids.proB, `update storage.objects set name = name where name like $1 returning id`, [`${ids.proB}/%`]);
    const delDraft = await as("authenticated", ids.proDraft, `delete from storage.objects where name like $1 returning id`, [`${ids.proDraft}/%`]);
    check("A27 M1: a pro under review cannot delete their KYC photo", delPending.count === 0 && !delPending.error);
    check("A28 M1: a pro under review cannot replace their KYC photo", updPending.count === 0 && !updPending.error);
    check("A29 M1: a pro with a draft can still retake (delete) a photo", delDraft.count === 1);

    // M4 / L1
    const anonAdmin = await as("anon", null, `select public.admin_approve_kyc($1)`, [ids.spB]);
    const authAdmin = await as("authenticated", ids.customer, `select public.admin_approve_kyc($1) r`, [ids.spB]);
    check("A30 M4: anon cannot run admin_approve_kyc", denied(anonAdmin), anonAdmin.error?.message);
    check("A31 M4: a signed-in non-admin can call it and is refused inside (admin app unchanged)", authAdmin.rows[0]?.r?.success === false);
    const anonKyc = await as("anon", null, `select * from public.provider_kyc`);
    check("A32 M4: anon has no grant on provider_kyc", denied(anonKyc), anonKyc.error?.message);
    const sp = await q(`select proconfig from pg_proc where proname = 'dispatch_km'`);
    check("A33 L1: dispatch_km has a fixed search_path", String(sp[0].proconfig).includes("search_path=public"));
    const fee = await q(`select public.fee_for_service_bill(1000) f`);
    check("A34 L1: fee_for_service_bill gives the same answer (logic untouched)", Number(fee[0].f) === 30);
  } finally {
    await stop();
  }
}

/** Runs a dry-run file: its last SELECT must be all true, and afterwards `stillThereSql` must return ok = true. */
async function runDryRun(file, label, stillThereSql) {
  const { c, q, stop } = await freshDb(`dry-${label}`);
  try {
    await seed(q);
    const res = await c.query(readFileSync(`${repo}/supabase/dryrun/${file}`, "utf8"));
    const row = (Array.isArray(res) ? res : [res]).filter((r) => r.command === "SELECT" && r.rows.length).pop()?.rows[0] ?? {};
    const allTrue = Object.keys(row).length > 0 && Object.values(row).every((v) => v === true);
    check(`${label}: dry run runs fully and every check is true`, allTrue, JSON.stringify(row));
    const after = (await q(stillThereSql))[0];
    check(`${label}: dry run saved nothing (ROLLBACK)`, after?.ok === true, JSON.stringify(after));
  } catch (e) {
    check(`${label}: dry run`, false, e.message);
  } finally {
    await stop();
  }
}

/** The dry-run and apply files must contain the proposal unchanged. */
function sameBody(proposal, dry, apply, label) {
  const body = P(proposal).trim();
  const d = readFileSync(`${repo}/supabase/dryrun/${dry}`, "utf8");
  const a = readFileSync(`${repo}/supabase/dryrun/${apply}`, "utf8");
  check(`${label}: dry-run and apply files carry the proposal unchanged`, d.includes(body) && a.includes(body)
    && /\nROLLBACK;\s*$/.test(d) && /\nCOMMIT;\s*$/.test(a));
}

try {
  await suiteA();
  sameBody(PROPOSAL_A, "25_security_hardening_DRYRUN.sql", "apply_25_security_hardening_COMMIT.sql", "A-files");
  await runDryRun("25_security_hardening_DRYRUN.sql", "A-dry",
    `select exists (select 1 from pg_policies where policyname = 'public_read_providers') ok`);
} catch (e) {
  check("suite crashed", false, e.stack ?? String(e));
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
