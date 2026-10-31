// "One job at a time" proposal 20261126000000 on a REAL throwaway Postgres 17 (embedded-postgres, deleted afterwards):
// live-like stub + instant dispatch (20261124000000, 000001) + the proposal (applied twice: re-run safe), then the rule's edge
// cases (the same ones as packages/shared/src/booking/provider-busy.test.ts), the two accept paths, dispatch, and TWO SESSIONS
// accepting at the same moment.
// Usage: node test-one-job.mjs <repo>
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.argv[2];
const here = new URL(".", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const dir = mkdtempSync(join(tmpdir(), "hf-onejob-"));
const port = 55000 + Math.floor(Math.random() * 900);
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {}, onError: () => {} });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  " + extra}`); };
const conn = () => new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "hf" });
const MSG = "You already have a job at this time. Finish it first.";

await server.initialise();
await server.start();
await server.createDatabase("hf");
const admin = conn();
await admin.connect();
admin.on("error", () => {});
const q = async (sql, params) => (await admin.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

try {
  await admin.query(readFileSync(join(here, "stub.sql"), "utf8"));
  await admin.query(`alter table services add column if not exists duration_minutes int default 60`);
  const read = (f) => readFileSync(`${repo}/supabase/proposals/${f}`, "utf8");
  await admin.query(read("20261124000000_instant_dispatch_PROPOSAL_NOT_APPLIED.sql"));
  await admin.query(read("20261124000001_dispatch_service_area_PROPOSAL_NOT_APPLIED.sql"));
  const mine = read("20261126000000_one_job_at_a_time_PROPOSAL_NOT_APPLIED.sql");
  await admin.query(mine);
  await admin.query(mine);
  check("the proposal applies on top of the wallet check and instant dispatch, and re-running changes nothing", true);

  // ── seed ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const S1 = "00000000-0000-0000-0000-0000000000a1", S2 = "00000000-0000-0000-0000-0000000000b2";
  await q(`insert into services (id, name, base_price, duration_minutes) values ($1,'TV Installation',349,60), ($2,'Deep cleaning',999,NULL)`, [S1, S2]);
  const C = { lat: 22.4707, lng: 70.0577 };
  let n = 0;
  const pro = async (label, km = 1) => {
    n += 1;
    const id = `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    const uid = `20000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    await q(`insert into service_providers (id,user_id,full_name,status,is_online,rating,service_ids,kyc_status,kyc_reviewed_at,city)
             values ($1,$2,$3,'active',true,4.5,$4,'approved',now() - interval '400 days','Jamnagar')`, [id, uid, label, [S1, S2]]);
    await q(`insert into wallet_transactions (provider_id, amount) values ($1, 500)`, [id]);
    await q(`insert into provider_presence values ($1,$2,$3,10, now())`, [id, C.lat + km / 111.195, C.lng]);
    return { id, uid };
  };
  const day = "2030-01-10";
  const job = async (p, status, time, over = {}) => (await one(
    `insert into bookings (customer_id, provider_id, service_id, status, booking_date, booking_time, scheduled_date, address, latitude, longitude, created_at)
     values ('30000000-0000-0000-0000-000000000099', $1, $2, $3, $4, $5, $4, 'x', $6, $7, now()) returning id`,
    [p?.id ?? null, over.service ?? S1, status, over.date ?? day, time, C.lat, C.lng])).id;
  const reset = async (p) => q(`delete from bookings where provider_id = $1`, [p.id]);
  const conflict = async (p, requestId) => (await one(`select public.provider_busy_conflict($1,$2) as c`, [p.id, requestId])).c;
  const request = (time, over) => job(null, "pending", time, over);

  // ── 1. the rule, case by case (same cases as the shared Vitest file) ───────────────────────────────────────────────
  const A = await pro("A rule");
  let r = await request("14:00");
  check("no jobs: free", (await conflict(A, r)) === null);

  for (const s of ["on_the_way", "arrived", "in_progress"]) {
    const j = await job(A, s, "08:00", { date: "2026-11-01" });
    check(`a job that is ${s} blocks, at any time of day`, (await conflict(A, r)) === j);
    await reset(A);
  }
  let j = await job(A, "confirmed", "13:30");
  check("a confirmed job at 13:30 (60 min) overlaps a 14:00 request", (await conflict(A, r)) === j);
  await reset(A);
  j = await job(A, "confirmed", "13:00");
  await q(`update bookings set service_id = $2 where id = $1`, [j, S2]);                    // service 2 has no duration: default 60
  check("the request starting inside a confirmed job (13:00 + 60 min default, +30 buffer) blocks", (await conflict(A, r)) === j);
  await reset(A);
  await job(A, "confirmed", "09:00");
  check("a confirmed job at a different time of day does not block", (await conflict(A, r)) === null);
  await reset(A);
  await job(A, "confirmed", "14:00", { date: "2030-01-11" });
  check("a confirmed job on another day does not block", (await conflict(A, r)) === null);
  await reset(A);
  for (const s of ["cancelled", "completed", "pending"]) await job(A, s, "14:00");
  check("cancelled, completed and pending jobs are ignored", (await conflict(A, r)) === null);
  await reset(A);
  await job(A, "confirmed", "12:30");
  check("boundary: a job ending exactly one buffer before the request (12:30 + 60 + 30 = 14:00) does not block", (await conflict(A, r)) === null);
  await reset(A);
  await job(A, "confirmed", "12:31");
  check("boundary: one minute inside the buffer blocks", (await conflict(A, r)) !== null);
  await reset(A);
  await job(A, "confirmed", "15:30");
  check("boundary: a job starting exactly one buffer after the request ends does not block", (await conflict(A, r)) === null);
  await reset(A);
  await job(A, "confirmed", "15:29");
  check("boundary: one minute inside the buffer after the request blocks", (await conflict(A, r)) !== null);
  await reset(A);
  await job(A, "confirmed", null);
  check("a confirmed job without a time is ignored", (await conflict(A, r)) === null);
  await reset(A);
  const j2 = await job(A, "confirmed", null);
  await q(`update bookings set booking_date = null, booking_time = null, scheduled_date = $2, scheduled_time = '14:00' where id = $1`, [j2, day]);
  check("the scheduled_* columns are used when booking_* is empty", (await conflict(A, r)) === j2);
  await reset(A);
  const rNoTime = await request(null);
  await job(A, "confirmed", "14:00");
  check("a request without a time is not blocked by a confirmed job", (await conflict(A, rNoTime)) === null);
  await job(A, "in_progress", "08:00", { date: "2026-11-01" });
  check("...but an active job still blocks it", (await conflict(A, rNoTime)) !== null);
  await reset(A);
  await q(`delete from bookings where id = any($1)`, [[r, rNoTime]]);

  // ── 2. the server check on accept (a pro answers a request addressed to them) ──────────────────────────────────────
  const as = async (uid, role = "authenticated") => {
    const c = conn();
    await c.connect();
    c.on("error", () => {});
    await c.query(`set role ${role}`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
    return {
      c,
      rpc: async (fn, args = []) => (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).rows[0].r,
      try: async (sql, args) => { try { return { rows: (await c.query(sql, args)).rows }; } catch (e) { return { error: e }; } },
      end: () => c.end(),
    };
  };
  const B = await pro("B accepts");
  const pb = await as(B.uid);
  const reqB1 = await job(B, "pending", "10:00");
  const busyJob = await job(B, "in_progress", "09:00", { date: "2026-11-01" });
  const refused = await pb.try(`update bookings set status = 'confirmed' where id = $1`, [reqB1]);
  check("a pro with a job in progress cannot accept: P0001 with the plain message", refused.error?.code === "P0001" && refused.error?.message === MSG, refused.error?.message);
  check("...the request stays pending", (await one(`select status::text s from bookings where id = $1`, [reqB1])).s === "pending");
  const Z = await pro("Z empty wallet");
  await q(`delete from wallet_transactions where provider_id = $1`, [Z.id]);
  await job(Z, "in_progress", "09:00", { date: "2026-11-01" });
  const reqZ = await job(Z, "pending", "10:00");
  const pz = await as(Z.uid);
  const zr = await pz.try(`update bookings set status = 'confirmed' where id = $1`, [reqZ]);
  check("the busy check runs before the wallet check (a busy pro with an empty wallet is told to finish the job, not to recharge)", zr.error?.message === MSG, zr.error?.message);
  await pz.end();
  await q(`update bookings set status = 'completed' where id = $1`, [busyJob]);
  const accepted = await pb.try(`update bookings set status = 'confirmed' where id = $1 returning status::text s`, [reqB1]);
  check("once the job is finished the same request can be accepted", accepted.rows?.[0]?.s === "confirmed", accepted.error?.message);
  const reqB2 = await job(B, "pending", "10:30");
  const second = await pb.try(`update bookings set status = 'confirmed' where id = $1`, [reqB2]);
  check("a second request at an overlapping time (10:30 vs the confirmed 10:00 job) is refused", second.error?.code === "P0001" && second.error.message === MSG);
  const reqB3 = await job(B, "pending", "17:00");
  const third = await pb.try(`update bookings set status = 'confirmed' where id = $1 returning status::text s`, [reqB3]);
  check("a request at a different time of day is accepted", third.rows?.[0]?.s === "confirmed", third.error?.message);
  const cancel = await q(`update bookings set status = 'cancelled' where id = $1 returning status::text s`, [reqB3]);
  check("cancelling and other status moves are not blocked", cancel[0].s === "cancelled");
  await pb.end();

  // ── 3. instant dispatch: the first-accept RPC and the offers ───────────────────────────────────────────────────────
  const D1 = await pro("D1", 1.0), D2 = await pro("D2", 1.2);
  const cust = "30000000-0000-0000-0000-000000000001";
  const customer = await as(cust);
  const book = async (time) => (await customer.c.query(
    `insert into bookings (customer_id, service_id, address, city, pincode, latitude, longitude, booking_date, booking_time, special_instructions)
     values ($1,$2,'12 MG Road','Jamnagar','361001',$3,$4,$5,$6,'x') returning id`, [cust, S1, C.lat, C.lng, day, time])).rows[0].id;
  const x1 = await book("11:00");
  await customer.rpc("start_dispatch", [x1]);
  const offered = (await q(`select provider_id from booking_offers where booking_id = $1`, [x1])).map((o) => o.provider_id);
  check("both free pros are offered the job", offered.includes(D1.id) && offered.includes(D2.id));
  await job(D1, "in_progress", "08:00", { date: "2026-11-01" });                              // D1 gets busy AFTER the offer
  const pd1 = await as(D1.uid), pd2 = await as(D2.uid);
  const a1 = await pd1.rpc("accept_dispatch_offer", [x1]);
  check("a busy pro cannot win an open offer: result 'refused' with the plain message", a1.result === "refused" && a1.message === MSG, JSON.stringify(a1));
  check("...the booking is still unassigned and searching", (await one(`select provider_id, dispatch_state from bookings where id = $1`, [x1])).provider_id === null);
  const a2 = await pd2.rpc("accept_dispatch_offer", [x1]);
  check("a free pro still wins the same offer afterwards", a2.result === "accepted", JSON.stringify(a2));
  check("the refusal is in the audit trail", Number((await one(`select count(*) n from dispatch_events where booking_id = $1 and event = 'accept_refused' and provider_id = $2`, [x1, D1.id])).n) === 1);
  const x2 = await book("11:15");
  await customer.rpc("start_dispatch", [x2]);
  const offered2 = (await q(`select provider_id from booking_offers where booking_id = $1`, [x2])).map((o) => o.provider_id);
  check("busy pros get no offer: D1 (job in progress) and D2 (confirmed 11:00 job overlaps 11:15) are both skipped",
    !offered2.includes(D1.id) && !offered2.includes(D2.id), JSON.stringify(offered2));
  await q(`update bookings set status = 'completed' where provider_id = $1`, [D1.id]);
  const cands = (await q(`select provider_id from dispatch_candidates($1)`, [x2])).map((c) => c.provider_id);
  check("a pro who finished the job is a candidate again (D2 is still blocked by the 11:00 job)", cands.includes(D1.id) && !cands.includes(D2.id));
  await pd1.end(); await pd2.end(); await customer.end();

  // ── 4. TWO SESSIONS AT ONCE ────────────────────────────────────────────────────────────────────────────────────────
  const E = await pro("E racer", 0.5);
  let oneWinner = 0;
  const ROUNDS = 6;
  for (let i = 0; i < ROUNDS; i++) {
    const t = `${String(8 + i).padStart(2, "0")}:00`;
    const ra = await job(E, "pending", t, { date: "2030-02-0" + (i + 1) }), rb = await job(E, "pending", t, { date: "2030-02-0" + (i + 1) });
    const s1 = await as(E.uid), s2 = await as(E.uid);
    const out = await Promise.all([
      s1.try(`update bookings set status = 'confirmed' where id = $1 returning id`, [ra]),
      s2.try(`update bookings set status = 'confirmed' where id = $1 returning id`, [rb]),
    ]);
    const wins = out.filter((o) => o.rows?.length === 1).length, losses = out.filter((o) => o.error?.message === MSG).length;
    if (wins === 1 && losses === 1) oneWinner += 1;
    await s1.end(); await s2.end();
  }
  check(`two accepts of overlapping requests at the same moment: exactly one wins, the other gets the message (${ROUNDS} of ${ROUNDS} rounds)`, oneWinner === ROUNDS, `${oneWinner}/${ROUNDS}`);

  const F = await pro("F dispatch racer", 0.4);
  const rounds2 = 4;
  let dispatchOk = 0;
  for (let i = 0; i < rounds2; i++) {
    const t = `${String(12 + i).padStart(2, "0")}:00`;
    const ids = [];
    for (let k = 0; k < 2; k++) {
      const cuid = `30000000-0000-0000-0000-${String(2000 + i * 10 + k).padStart(12, "0")}`;
      const cu = await as(cuid);
      const id = (await cu.c.query(
        `insert into bookings (customer_id, service_id, address, city, pincode, latitude, longitude, booking_date, booking_time, special_instructions)
         values ($1,$2,'12 MG Road','Jamnagar','361001',$3,$4,$5,$6,'x') returning id`, [cuid, S1, C.lat, C.lng, "2030-03-0" + (i + 1), t])).rows[0].id;
      await cu.rpc("start_dispatch", [id]);
      ids.push(id);
      await cu.end();
    }
    const f1 = await as(F.uid), f2 = await as(F.uid);
    const res = await Promise.all([f1.rpc("accept_dispatch_offer", [ids[0]]), f2.rpc("accept_dispatch_offer", [ids[1]])]);
    const won = res.filter((x) => x.result === "accepted").length, refusedN = res.filter((x) => x.result === "refused" && x.message === MSG).length;
    const assigned = Number((await one(`select count(*) n from bookings where provider_id = $1 and booking_date = $2 and status = 'confirmed'`, [F.id, "2030-03-0" + (i + 1)])).n);
    if (won === 1 && refusedN === 1 && assigned === 1) dispatchOk += 1;
    await f1.end(); await f2.end();
  }
  check(`the same pro racing two instant-dispatch offers: exactly one is accepted, one refused (${rounds2} of ${rounds2} rounds)`, dispatchOk === rounds2, `${dispatchOk}/${rounds2}`);

  // ── 5. the customer's list function and permissions ────────────────────────────────────────────────────────────────
  const G = await pro("G busy at 14:00"), H = await pro("H free");
  await job(G, "confirmed", "14:30");
  const cl = await as(cust);
  const busyIds = (await cl.c.query(`select * from public.providers_busy_at($1::uuid[], $2::date, '14:00'::time, $3)`, [[G.id, H.id], day, S1])).rows.map((x) => x.providers_busy_at);
  check("providers_busy_at returns only the busy pro's id (no job details)", busyIds.length === 1 && busyIds[0] === G.id, JSON.stringify(busyIds));
  const direct = await cl.try(`select public.provider_busy_conflict($1,$2)`, [G.id, r]);
  check("the signed-in app cannot call the rule itself (it would reveal job ids)", direct.error?.code === "42501", direct.error?.message);
  await cl.end();
  const an = await as("", "anon");
  const anonCall = await an.try(`select * from public.providers_busy_at($1::uuid[], $2::date, '14:00'::time, $3)`, [[G.id], day, S1]);
  check("an anonymous visitor cannot use the customer list function", anonCall.error?.code === "42501", anonCall.error?.message);
  await an.end();
  const grants = await one(`select has_function_privilege('anon','public.provider_busy_core(uuid,uuid,timestamp,integer)','execute') a,
                                   has_function_privilege('authenticated','public.provider_busy_core(uuid,uuid,timestamp,integer)','execute') b,
                                   has_function_privilege('anon','public.enforce_one_job_at_a_time()','execute') c`);
  check("the helper and the trigger function are not callable by apps", !grants.a && !grants.b && !grants.c);
} catch (e) {
  check("the test ran without an unexpected error", false, e.stack ?? String(e));
} finally {
  await admin.end().catch(() => undefined);
  await server.stop().catch(() => undefined);
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* Windows may hold the folder a moment */ }
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed${failed ? `, ${failed} FAILED` : ""}.`);
process.exit(failed ? 1 : 0);
