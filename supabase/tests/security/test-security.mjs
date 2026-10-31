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


const PROPOSAL_B = "20261125000001_kyc_pan_encryption_PROPOSAL_NOT_APPLIED.sql";
const PROPOSAL_C = "20261125000002_kyc_drop_plain_columns_PROPOSAL_NOT_APPLIED.sql";
const HEX = (c) => c.repeat(64);

// ── Proposals B and C ─────────────────────────────────────────────────────────────────────────────────────────────────
async function suiteBC() {
  const { q, as, stop } = await freshDb("bc");
  try {
    await seed(q);
    // a draft that is on step 5 of the old 9-step wizard, and rows with old plain PAN + Aadhaar data
    await q(`update public.service_providers set onboarding_step = 5 where id = $1`, [ids.spDraft]);
    await q(`update public.service_providers set kyc_reviewed_at = now() - interval '60 days' where id = $1`, [ids.spA]);
    await q(`insert into public.provider_kyc (provider_id, aadhaar_last4, aadhaar_hash, pan_number, aadhaar_front_path, aadhaar_back_path, selfie_path, pan_path, consent_accepted_at)
             values ($1,'1234','h1','ABCDE1234F',$3,$4,$5,$6, now()), ($2,'5678','h2','VWXYZ5678K','b/af','b/ab','b/selfie','b/pan', now())`,
      [ids.spA, ids.spB, `${ids.proA}/aadhaar_front_1.jpg`, `${ids.proA}/aadhaar_back_1.jpg`, `${ids.proA}/selfie_1.jpg`, `${ids.proA}/pan_1.jpg`]);

    await q(P(PROPOSAL_B));
    await q(P(PROPOSAL_B));
    check("B1 proposal B applies and re-runs safely", true);
    check("B2 the wizard's saved step moves down one, once (5 -> 4, not 3 after the re-run)",
      (await q(`select onboarding_step s from public.service_providers where id = $1`, [ids.spDraft]))[0].s === 4);

    // Unique blind index
    const sealed = (n) => `'ct${n}', 'AAAAAAAAAAAAAAAA', 1, '234F', '${HEX("a")}'`;
    const cols = `pan_encrypted, pan_nonce, pan_key_version, pan_last4, pan_blind_index`;
    await q(`update public.provider_kyc set (${cols}) = (${sealed(1)}) where provider_id = $1`, [ids.spA]);
    const dup = await as("service_role", null, `update public.provider_kyc set (${cols}) = (${sealed(2)}) where provider_id = $1`, [ids.spB]);
    check("B3 a second pro with the same PAN blind index is refused (unique)", dup.error?.code === "23505", dup.error?.message);
    const badShape = await as("service_role", null, `update public.provider_kyc set pan_encrypted = 'x' where provider_id = $1`, [ids.spB]);
    check("B4 half-filled PAN columns are refused (shape check)", badShape.error?.code === "23514", badShape.error?.message);

    // Who can read / write what
    const ownRows = await as("authenticated", ids.proA, `select provider_id, pan_last4 from public.provider_kyc`);
    check("B5 a pro reads only their own KYC row, with pan_last4", ownRows.count === 1 && ownRows.rows[0].pan_last4 === "234F", JSON.stringify(ownRows.rows));
    for (const col of ["pan_number", "pan_encrypted", "pan_blind_index", "pan_nonce", "aadhaar_hash", "aadhaar_last4", "phone_blind_index"]) {
      const r = await as("authenticated", ids.proA, `select ${col} from public.provider_kyc`);
      check(`B6 a pro cannot read provider_kyc.${col}`, denied(r), r.error?.message);
    }
    const adminRead = await as("authenticated", ids.admin, `select provider_id from public.provider_kyc`);
    check("B7 an admin reads every KYC row (non-secret columns)", adminRead.count === 2);
    const anon = await as("anon", null, `select provider_id from public.provider_kyc`);
    check("B8 anon reads nothing", denied(anon), anon.error?.message);
    const writePan = await as("authenticated", ids.proDraft, `update public.provider_kyc set pan_encrypted = 'x' where provider_id = $1`, [ids.spDraft]);
    const writeHold = await as("authenticated", ids.proA, `update public.provider_kyc set legal_hold = false where provider_id = $1`, [ids.spA]);
    const writeIdx = await as("authenticated", ids.proDraft,
      `insert into public.provider_kyc (provider_id, pan_blind_index) values ($1, '${HEX("c")}')`, [ids.spDraft]);
    check("B9 a pro cannot write the PAN columns", denied(writePan), writePan.error?.message);
    check("B10 a pro cannot clear their own legal hold", denied(writeHold), writeHold.error?.message);
    check("B11 a pro cannot insert a blind index", denied(writeIdx), writeIdx.error?.message);
    const okWrite = await as("authenticated", ids.proDraft, `insert into public.provider_kyc (provider_id, selfie_path, pan_path) values ($1, 'x/s', 'x/p') returning provider_id`, [ids.spDraft], true);
    check("B12 a pro can still save their own selfie / PAN photo paths", !okWrite.error, okWrite.error?.message);
    // trigger as the last line of defence: grant the column by mistake and the trigger still refuses
    await q(`grant update (pan_last4) on public.provider_kyc to authenticated`);
    const viaGrant = await as("authenticated", ids.proDraft, `update public.provider_kyc set pan_last4 = '999Z' where provider_id = $1`, [ids.spDraft]);
    check("B13 even with a mistaken GRANT the trigger refuses server-only columns", viaGrant.error !== null && /can only be saved by HandyFix/.test(viaGrant.error.message), viaGrant.error?.message);
    await q(`revoke update (pan_last4) on public.provider_kyc from authenticated`);

    // Access log
    await q(`insert into public.kyc_access_log (actor_id, provider_id, action, detail) values ($1, $2, 'view_pan', 'support call')`, [ids.admin, ids.spA]);
    const logUpd = await as("service_role", null, `update public.kyc_access_log set detail = 'edited'`);
    const logDel = await as("service_role", null, `delete from public.kyc_access_log`);
    check("B14 the access log cannot be edited or deleted", /append-only/.test(logUpd.error?.message ?? "") && /append-only/.test(logDel.error?.message ?? ""));
    const logAdmin = await as("authenticated", ids.admin, `select * from public.kyc_access_log`);
    const logPro = await as("authenticated", ids.proA, `select * from public.kyc_access_log`);
    const logInsert = await as("authenticated", ids.admin, `insert into public.kyc_access_log (provider_id, action) values ($1, 'view_pan')`, [ids.spA]);
    check("B15 only admins read the access log", logAdmin.count === 1 && logPro.count === 0);
    check("B16 nobody can write the access log from the app (even an admin)", denied(logInsert), logInsert.error?.message);
    const viewDoc = await as("authenticated", ids.admin, `select public.log_kyc_document_view($1, 'selfie')`, [ids.spA], true);
    const viewDocPro = await as("authenticated", ids.proA, `select public.log_kyc_document_view($1, 'selfie')`, [ids.spA]);
    check("B17 an admin's document view is logged; a pro cannot call it",
      !viewDoc.error && (await q(`select count(*)::int n from public.kyc_access_log where action = 'view_document'`))[0].n === 1 && viewDocPro.error !== null);

    // Blocklist
    const hit = async (pan, phone, bank) => (await as("service_role", null, `select public.kyc_blocklist_hit($1,$2,$3) h`, [pan, phone, bank])).rows[0].h;
    check("B18 blocklist: nothing listed yet means no hit", (await hit(HEX("a"), null, null)) === false);
    const bl = await as("authenticated", ids.admin, `select public.admin_blocklist_provider($1, 'fraud case 12') n`, [ids.spA], true);
    check("B19 an admin can blocklist a pro's stored hashes (PAN here; phone/bank name were null)", bl.rows[0]?.n === 1, bl.error?.message);
    check("B20 blocklist hit by PAN hash", (await hit(HEX("a"), null, null)) === true);
    check("B21 blocklist miss for other hashes", (await hit(HEX("e"), HEX("f"), HEX("0"))) === false);
    await q(`insert into public.kyc_blocklist (kind, value_hash, reason) values ('phone', '${HEX("9")}', 'known scammer')`);
    check("B22 blocklist hit by phone hash", (await hit(null, HEX("9"), null)) === true);
    const blPro = await as("authenticated", ids.proA, `select public.admin_blocklist_provider($1, 'x y z')`, [ids.spB]);
    const blRead = await as("authenticated", ids.proA, `select * from public.kyc_blocklist`);
    check("B23 a pro can neither blocklist nor read the blocklist", blPro.error !== null && blRead.count === 0);

    // submit_kyc without Aadhaar
    await q(`update public.service_providers set first_name='Ravi', last_name='Patel', date_of_birth='1990-01-01', pincodes=ARRAY['Jamnagar'],
             service_ids=ARRAY[gen_random_uuid()], kyc_status='not_submitted' where id = $1`, [ids.spDraft]);
    await q(`update public.provider_kyc set consent_accepted_at = now(), pan_path = 'x/p', selfie_path = 'x/s' where provider_id = $1`, [ids.spDraft]);
    const noPan = await as("authenticated", ids.proDraft, `select public.submit_kyc() r`);
    check("B24 submit_kyc: refused without the encrypted PAN", noPan.rows[0]?.r?.success === false && /PAN/.test(noPan.rows[0].r.error), JSON.stringify(noPan.rows));
    await q(`update public.provider_kyc set (${cols}) = ('ct9','AAAAAAAAAAAAAAAA',1,'678K','${HEX("d")}') where provider_id = $1`, [ids.spDraft]);
    const ok = await as("authenticated", ids.proDraft, `select public.submit_kyc() r`);
    check("B25 submit_kyc: succeeds with PAN + selfie + PAN photo and NO Aadhaar at all", ok.rows[0]?.r?.success === true, JSON.stringify(ok.rows));
    await q(`insert into public.kyc_blocklist (kind, value_hash, reason) values ('pan', '${HEX("d")}', 'blocked pan')`);
    const blocked = await as("authenticated", ids.proDraft, `select public.submit_kyc() r`);
    check("B26 submit_kyc: refused for a blocklisted PAN", blocked.rows[0]?.r?.success === false && /cannot accept/.test(blocked.rows[0].r.error), JSON.stringify(blocked.rows));
    const anonSubmit = await as("anon", null, `select public.submit_kyc()`);
    check("B27 anon cannot call submit_kyc", denied(anonSubmit), anonSubmit.error?.message);

    // Retention
    const days = (await q(`select photo_retention_days d, retention_doc_kinds k from public.kyc_settings`))[0];
    check("B28 retention defaults: 30 days (placeholder), Aadhaar photos only", days.d === 30 && days.k.join() === "aadhaar_front,aadhaar_back");
    await q(`update public.service_providers set kyc_status='approved', kyc_reviewed_at = now() - interval '60 days' where id in ($1,$2)`, [ids.spA, ids.spB]);
    await q(`update public.service_providers set kyc_status='approved', kyc_reviewed_at = now() - interval '5 days' where id = $1`, [ids.spDraft]);
    await q(`update public.provider_kyc set aadhaar_front_path='d/af' where provider_id = $1`, [ids.spDraft]);
    await q(`update public.provider_kyc set legal_hold = true, legal_hold_reason = 'police request' where provider_id = $1`, [ids.spB]);
    const due = (await as("service_role", null, `select * from public.kyc_retention_due(100)`)).rows;
    check("B29 retention: only the approved, old, non-held pro is due (not the held one, not the recent one)",
      due.length === 1 && due[0].provider_id === ids.spA, JSON.stringify(due));
    check("B30 retention lists only Aadhaar photos, never the selfie or the PAN photo",
      due[0].paths.length === 2 && due[0].paths.every((x) => x.includes("aadhaar_")), JSON.stringify(due[0]?.paths));
    const heldDone = await as("service_role", null, `select public.kyc_retention_mark_done($1, ARRAY['b/af','b/ab']) n`, [ids.spB], true);
    check("B31 mark_done refuses a pro on legal hold (re-checked under lock)", heldDone.rows[0]?.n === 0
      && (await q(`select aadhaar_front_path p from public.provider_kyc where provider_id = $1`, [ids.spB]))[0].p === "b/af");
    const done = await as("service_role", null, `select public.kyc_retention_mark_done($1, $2) n`, [ids.spA, due[0].paths], true);
    const after = (await q(`select aadhaar_front_path af, selfie_path s, pan_path p, photos_deleted_at d from public.provider_kyc where provider_id = $1`, [ids.spA]))[0];
    check("B32 mark_done clears the Aadhaar photo paths, keeps selfie + PAN photo, stamps the date",
      done.rows[0]?.n === 2 && after.af === null && after.s && after.p && after.d, JSON.stringify(after));
    check("B33 the deletion is written to the access log", (await q(`select count(*)::int n from public.kyc_access_log where action = 'retention_delete' and provider_id = $1`, [ids.spA]))[0].n === 1);
    check("B34 after that nothing is due for that pro", (await as("service_role", null, `select * from public.kyc_retention_due(100)`)).rows.filter((r) => r.provider_id === ids.spA).length === 0);
    check("B35 retention functions are not callable by apps", denied(await as("authenticated", ids.admin, `select * from public.kyc_retention_due(1)`))
      && denied(await as("authenticated", ids.admin, `select public.kyc_retention_mark_done($1, ARRAY['a'])`, [ids.spA])));
    const job = await q(`select schedule from cron.job where jobname = 'kyc-retention'`);
    check("B36 the daily retention job is scheduled once (03:15 IST)", job.length === 1 && job[0].schedule === "45 21 * * *");
    await q(`select public.kyc_retention_kick()`);
    check("B37 the retention kick does nothing (no error) while pg_net / the vault secret are not set up", true);

    // Proposal C
    const refuse = await q(P(PROPOSAL_C)).then(() => null, (e) => e);
    check("C1 proposal C refuses while plain PAN / Aadhaar values remain", refuse !== null && /still has/.test(refuse.message), refuse?.message);
    check("C2 ...and changed nothing", (await q(`select count(*)::int n from information_schema.columns where table_name = 'provider_kyc' and column_name = 'pan_number'`))[0].n === 1);
    await q(`update public.provider_kyc set pan_number = null, aadhaar_last4 = null, aadhaar_hash = null, aadhaar_front_path = null, aadhaar_back_path = null`);
    await q(P(PROPOSAL_C));
    await q(P(PROPOSAL_C));
    const left = await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'provider_kyc'
                          and (column_name = 'pan_number' or column_name like 'aadhaar%')`);
    check("C3 after the script ran, proposal C drops pan_number and every Aadhaar column (and re-runs safely)", left.length === 0, JSON.stringify(left));
    check("C4 the plain-PAN unique index is gone, the blind-index one stays",
      (await q(`select indexname from pg_indexes where tablename = 'provider_kyc' and indexname in ('provider_kyc_pan_unique','provider_kyc_pan_blind_unique')`)).map((r) => r.indexname).join() === "provider_kyc_pan_blind_unique");
    const dueAfter = await as("service_role", null, `select * from public.kyc_retention_due(10)`);
    check("C5 retention still works after the Aadhaar columns are gone", !dueAfter.error, dueAfter.error?.message);
    check("C6 submit_kyc still works after the Aadhaar columns are gone", (await as("authenticated", ids.proA, `select public.submit_kyc() r`)).error === null);
    const plainOtp = await q(`select count(*)::int n from information_schema.columns where table_name = 'provider_otp_codes' and column_name = 'otp_code'`);
    check("C7 without proposal A the plain OTP column is left alone", plainOtp[0].n === 1);
  } finally {
    await stop();
  }
}

/** A then B then C in order, twice: everything must still hold together (and the OTP plain column goes in C). */
async function suiteOrder() {
  const { q, stop } = await freshDb("order");
  try {
    await seed(q);
    await q(P(PROPOSAL_A)); await q(P(PROPOSAL_B));
    await q(P(PROPOSAL_C));
    await q(P(PROPOSAL_A)); await q(P(PROPOSAL_B)); await q(P(PROPOSAL_C));
    const otp = await q(`select count(*)::int n from information_schema.columns where table_name = 'provider_otp_codes' and column_name = 'otp_code'`);
    check("O1 A -> B -> C applies, and A -> B -> C again changes nothing", true);
    check("O2 proposal C drops the plain OTP column once proposal A emptied it", otp[0].n === 0);
  } finally {
    await stop();
  }
}

/** Runs a dry-run file: its last SELECT must be all true, and afterwards `stillThereSql` must return ok = true. */
async function runDryRun(file, label, stillThereSql, prelude = []) {
  const { c, q, stop } = await freshDb(`dry-${label}`);
  try {
    await seed(q);
    for (const name of prelude) await q(P(name));
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
  await suiteBC();
  await suiteOrder();
  sameBody(PROPOSAL_B, "26_kyc_pan_encryption_DRYRUN.sql", "apply_26_kyc_pan_encryption_COMMIT.sql", "B-files");
  await runDryRun("26_kyc_pan_encryption_DRYRUN.sql", "B-dry",
    `select not exists (select 1 from information_schema.columns where table_name = 'provider_kyc' and column_name = 'pan_blind_index') ok`);
  sameBody(PROPOSAL_C, "27_kyc_drop_plain_columns_DRYRUN.sql", "apply_27_kyc_drop_plain_columns_COMMIT.sql", "C-files");
} catch (e) {
  check("suite crashed", false, e.stack ?? String(e));
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
