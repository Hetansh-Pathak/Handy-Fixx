// Attack walkthrough (docs/SECURITY_ATTACK_WALKTHROUGH.md) on a REAL throwaway Postgres 17 loaded with the LIVE tables, policies,
// triggers and money / completion functions (stub.sql + stub-attacks.sql, copied from read-only catalog queries on 2026-11-01).
// Phase 1 = the database as it is today: the holes are reproduced. Phase 2 = after proposals A, D and E: the same attacks must fail.
// Usage: node test-attacks.mjs <repo>
import { readFileSync } from "node:fs";
import { check, denied, finish, freshDb } from "./harness.mjs";

const repo = process.argv[2];
const P = (name) => readFileSync(`${repo}/supabase/proposals/${name}`, "utf8");
const A = "20261125000000_security_hardening_PROPOSAL_NOT_APPLIED.sql";
const D = "20261125000003_permissions_hardening_PROPOSAL_NOT_APPLIED.sql";
const E = "20261125000004_booking_integrity_PROPOSAL_NOT_APPLIED.sql";

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const id = { admin: U(1), proA: U(11), proB: U(12), c1: U(21), c2: U(22), spA: U(111), spB: U(112), svc: U(301) };
const PRICE = 500;

async function world(label, proposals) {
  const db = await freshDb(label, ["stub.sql", "stub-attacks.sql"]);
  const { q } = db;
  await q(`insert into auth.users (id, email) values ($1,'admin@x.in'),($2,'a@x.in'),($3,'b@x.in'),($4,'c1@x.in'),($5,'c2@x.in')`, [id.admin, id.proA, id.proB, id.c1, id.c2]);
  await q(`insert into public.user_roles values ($1,'admin')`, [id.admin]);
  await q(`insert into public.service_providers (id,user_id,full_name,phone,email,kyc_status,status,is_online)
           values ($1,$2,'Pro A','9000000001','a@x.in','approved','active',true), ($3,$4,'Pro B','9000000002','b@x.in','approved','active',true)`, [id.spA, id.proA, id.spB, id.proB]);
  await q(`insert into public.services (id,name,base_price) values ($1,'Plumbing',$2)`, [id.svc, PRICE]);
  for (const p of proposals) await q(P(p));
  /** A customer creates a booking the way the app does (plus anything in `over`); returns the id. */
  const book = async (uid, over = {}, keep = true) => {
    const cols = { customer_id: uid, provider_id: id.spA, service_id: id.svc, address: '1 MG Road', status: "pending", ...over };
    const keys = Object.keys(cols);
    const r = await db.as("authenticated", uid, `insert into public.bookings (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, keys.map((k) => cols[k]), keep);
    return { id: r.rows[0]?.id, error: r.error };
  };
  /** The server moves a booking along (what the pro app + dispatch do, with the proper guards, as the owner). */
  const server = (bookingId, status) => q(`update public.bookings set status = $2 where id = $1`, [bookingId, status]);
  return { ...db, book, server };
}

/** The attacks whose answer should be the same today and after the fixes. */
async function common(w, tag) {
  const { q, as, book, server } = w;
  const t = (n) => `${tag} ${n}`;

  // ── price tampering ──
  const b1 = await book(id.c1, { total_amount: 1, provider_amount: 1, platform_fee: 999, service_charge: 1, extras_amount: 9999 });
  const stored = (await q(`select total_amount, provider_amount, platform_fee, extras_amount from public.bookings where id = $1`, [b1.id]))[0];
  check(t("PRICE: a price sent on insert is ignored; the catalogue price is stored (no fee, no extras)"),
    Number(stored.total_amount) === PRICE && Number(stored.provider_amount) === PRICE && Number(stored.platform_fee) === 0 && Number(stored.extras_amount) === 0, JSON.stringify(stored));
  for (const [col, val] of [["total_amount", 1], ["provider_amount", 1], ["platform_fee", 99], ["extras_amount", 5], ["payment_status", "'paid'"], ["final_amount", 1], ["coupon_discount", 400]]) {
    const r = await as("authenticated", id.c1, `update public.bookings set ${col} = ${val} where id = $1`, [b1.id]);
    check(t(`PRICE: the customer cannot change ${col} afterwards`), denied(r), r.error?.message);
  }
  await server(b1.id, "confirmed");
  const pr = await as("authenticated", id.proA, `update public.bookings set total_amount = 5000 where id = $1`, [b1.id]);
  check(t("PRICE: the pro cannot raise the booking total"), denied(pr), pr.error?.message);
  const re = await as("authenticated", id.c1, `update public.bookings set provider_id = $2 where id = $1`, [b1.id, id.spB]);
  check(t("PRICE: the customer cannot hand the job to another pro"), denied(re), re.error?.message);
  const se = await as("authenticated", id.c1, `update public.bookings set status = 'completed' where id = $1`, [b1.id]);
  check(t("PRICE: the customer cannot mark their own booking completed"), denied(se), se.error?.message);

  // ── extra work: only the customer can approve ──
  await server(b1.id, "in_progress");
  const own = await as("authenticated", id.proA, `select public.add_booking_extra($1, 'Extra pipe', 300, 'labour') r`, [b1.id], true);
  const extraId = own.rows[0]?.r?.id;
  check(t("EXTRAS: the pro can request extra work on their own job"), own.rows[0]?.r?.ok === true, JSON.stringify(own.rows));
  const selfApprove = await as("authenticated", id.proA, `select public.decide_booking_extra($1, true) r`, [extraId]);
  check(t("EXTRAS: the pro cannot approve their own extra"), selfApprove.rows[0]?.r?.reason === "unauthorized", JSON.stringify(selfApprove.rows));
  const strangerApprove = await as("authenticated", id.c2, `select public.decide_booking_extra($1, true) r`, [extraId]);
  check(t("EXTRAS: a stranger cannot approve it either"), strangerApprove.rows[0]?.r?.reason === "unauthorized");
  const otherPro = await as("authenticated", id.proB, `select public.add_booking_extra($1, 'Fake extra', 300) r`, [b1.id]);
  check(t("EXTRAS: another pro cannot add extra work to someone else's job"), otherPro.rows[0]?.r?.reason === "unauthorized");
  const huge = await as("authenticated", id.proA, `select public.add_booking_extra($1, 'Gold taps', 100001) r`, [b1.id]);
  check(t("EXTRAS: an absurd amount is refused"), huge.rows[0]?.r?.reason === "invalid_amount");
  const approve = await as("authenticated", id.c1, `select public.decide_booking_extra($1, true) r`, [extraId], true);
  check(t("EXTRAS: only the customer's approval raises the total (500 + 300)"),
    approve.rows[0]?.r?.ok === true && Number((await q(`select total_amount from public.bookings where id = $1`, [b1.id]))[0].total_amount) === PRICE + 300);

  // ── completion code ──
  const b2 = await book(id.c1);
  await server(b2.id, "confirmed");
  const early = await as("authenticated", id.proA, `select public.complete_booking_with_code($1, '0000') r`, [b2.id]);
  check(t("CODE: a job that has not started cannot be completed"), early.rows[0]?.r?.reason === "invalid_status");
  await server(b2.id, "in_progress");
  const direct = await as("authenticated", id.proA, `update public.bookings set status = 'completed' where id = $1`, [b2.id]);
  check(t("CODE: the pro cannot skip the code with a direct update"), denied(direct), direct.error?.message);
  const directC = await as("authenticated", id.c1, `update public.bookings set status = 'completed' where id = $1`, [b2.id]);
  check(t("CODE: neither can the customer"), denied(directC), directC.error?.message);
  const code = (await q(`select code from public.booking_completion_codes where booking_id = $1`, [b2.id]))[0].code;
  check(t("CODE: the code is 4 digits"), /^\d{4}$/.test(code), code);
  const seen = await as("authenticated", id.proA, `select code from public.booking_completion_codes where booking_id = $1`, [b2.id]);
  const seenStranger = await as("authenticated", id.c2, `select code from public.booking_completion_codes where booking_id = $1`, [b2.id]);
  const seenOwn = await as("authenticated", id.c1, `select code from public.booking_completion_codes where booking_id = $1`, [b2.id]);
  check(t("CODE: only the booking's customer can read the code (not the pro, not a stranger)"), seen.count === 0 && seenStranger.count === 0 && seenOwn.count === 1);
  const wrong = code === "0000" ? "1111" : "0000";
  const strangerTry = await as("authenticated", id.c1, `select public.complete_booking_with_code($1, $2) r`, [b2.id, code]);
  const otherProTry = await as("authenticated", id.proB, `select public.complete_booking_with_code($1, $2) r`, [b2.id, code]);
  check(t("CODE: the customer and a different pro cannot complete it, even with the right code"),
    strangerTry.rows[0]?.r?.reason === "unauthorized" && otherProTry.rows[0]?.r?.reason === "unauthorized");
  const tries = [];
  for (let i = 0; i < 5; i++) tries.push((await as("authenticated", id.proA, `select public.complete_booking_with_code($1, $2) r`, [b2.id, wrong], true)).rows[0].r);
  check(t("CODE: five wrong guesses count down and then lock"), tries.map((x) => x.attempts_left).join() === "4,3,2,1,0" && tries[4].locked === true, JSON.stringify(tries.map((x) => [x.reason, x.attempts_left, x.locked])));
  const locked = (await as("authenticated", id.proA, `select public.complete_booking_with_code($1, $2) r`, [b2.id, code], true)).rows[0].r;
  check(t("CODE: while locked even the RIGHT code is refused (no brute force)"), locked.reason === "locked", JSON.stringify(locked));
  await q(`update public.booking_completion_codes set locked_until = null where booking_id = $1`, [b2.id]);
  const after = (await as("authenticated", id.proA, `select public.complete_booking_with_code($1, $2) r`, [b2.id, wrong], true)).rows[0].r;
  check(t("CODE: after the lock ends the very next wrong guess locks again (attempts are not reset)"), after.locked === true, JSON.stringify(after));
  await q(`update public.booking_completion_codes set locked_until = null, failed_attempts = 0 where booking_id = $1`, [b2.id]);
  const done = (await as("authenticated", id.proA, `select public.complete_booking_with_code($1, $2) r`, [b2.id, code], true)).rows[0].r;
  const final = (await q(`select status, completed_at from public.bookings where id = $1`, [b2.id]))[0];
  check(t("CODE: the right code from the booking's own pro completes it"), done.ok === true && final.status === "completed" && final.completed_at !== null, JSON.stringify(done));

  // ── reading other people's bookings ──
  const c2b = await as("authenticated", id.c2, `select id from public.bookings`);
  check(t("IDOR: a stranger sees none of the bookings"), c2b.count === 0 && !c2b.error, String(c2b.count));
  const c2c = await as("authenticated", id.c2, `select 1 from public.booking_completion_codes`);
  const c2e = await as("authenticated", id.c2, `select 1 from public.booking_extras`);
  check(t("IDOR: a stranger sees no completion codes and no extras"), c2c.count === 0 && c2e.count === 0);
  const pB = await as("authenticated", id.proB, `select id from public.bookings`);
  check(t("IDOR: a different pro sees none of this pro's bookings"), pB.count === 0 && !pB.error);
  const gp = await as("authenticated", id.c2, `select public.get_booking_provider($1) r`, [b1.id]);
  check(t("IDOR: a stranger cannot read a booking's pro or phone through get_booking_provider"), gp.rows[0]?.r === null);
  const gpOwn = await as("authenticated", id.c1, `select public.get_booking_provider($1) r`, [b1.id]);
  check(t("IDOR: the booking's own customer sees the pro (and the phone while the job is active)"), gpOwn.rows[0]?.r?.phone === "9000000001", JSON.stringify(gpOwn.rows));
  const arr = await as("authenticated", id.c2, `select public.record_arrival($1) r`, [b1.id]);
  check(t("IDOR: a stranger cannot record an arrival on someone else's booking"), arr.rows[0]?.r?.success === false);
  const upd = await as("authenticated", id.c2, `update public.bookings set address = 'hijacked' where id = $1 returning id`, [b1.id]);
  check(t("IDOR: a stranger's update of someone else's booking changes nothing"), upd.count === 0 || denied(upd));
  const insForeignAtt = await as("authenticated", id.c2, `insert into public.booking_attachments (booking_id, uploaded_by, type) values ($1, $2, 'image')`, [b1.id, id.c2]);
  check(`${tag} IDOR: a stranger attaching a file to someone else's booking is ${tag.startsWith("TODAY") ? "possible (hole M9)" : "refused"}`,
    tag.startsWith("TODAY") ? !insForeignAtt.error : denied(insForeignAtt), insForeignAtt.error?.message);

  // ── webhook replay, at the database ──
  const o1 = `order_${tag.replace(/\W/g, "")}_1`;
  await q(`insert into public.wallet_topup_orders (order_id, provider_id, amount) values ($1, $2, 100)`, [o1, id.spA]);
  const topup = (order, pay, paise) => q(`select public.record_wallet_topup($1, $2, $3) r`, [order, pay, paise]).then((r) => r[0].r.result);
  const rows = async () => Number((await q(`select count(*)::int n from public.wallet_transactions where provider_id = $1 and type = 'topup'`, [id.spA]))[0].n);
  const before = await rows();
  const first = await topup(o1, `pay_${tag.replace(/\W/g, "")}_1`, 10000);
  const again = await topup(o1, `pay_${tag.replace(/\W/g, "")}_1`, 10000);
  check(t("REPLAY: a payment event delivered twice credits the wallet once ('credited', then 'duplicate')"), first === "credited" && again === "duplicate" && (await rows()) === before + 1, `${first},${again}`);
  const o2 = `order_${tag.replace(/\W/g, "")}_2`;
  await q(`insert into public.wallet_topup_orders (order_id, provider_id, amount) values ($1, $2, 100)`, [o2, id.spA]);
  const clients = await Promise.all(Array.from({ length: 6 }, () => w.newClient()));
  const par = await Promise.all(clients.map((c) => c.query(`select public.record_wallet_topup($1, $2, 10000) r`, [o2, `pay_${tag.replace(/\W/g, "")}_2`]).then((r) => r.rows[0].r.result)));
  check(t("REPLAY: six identical events arriving at the same moment credit exactly once"),
    par.filter((x) => x === "credited").length === 1 && par.filter((x) => x === "duplicate").length === 5 && (await rows()) === before + 2, par.join());
  const o3 = `order_${tag.replace(/\W/g, "")}_3`;
  await q(`insert into public.wallet_topup_orders (order_id, provider_id, amount) values ($1, $2, 100)`, [o3, id.spA]);
  const o3reuse = await topup(o3, `pay_${tag.replace(/\W/g, "")}_1`, 10000);
  check(t("REPLAY: re-using an old payment id on a new order credits nothing more"), (await rows()) === before + 2, o3reuse);
  const o4 = `order_${tag.replace(/\W/g, "")}_4`;
  await q(`insert into public.wallet_topup_orders (order_id, provider_id, amount) values ($1, $2, 199)`, [o4, id.spA]);
  const mismatch = await topup(o4, `pay_${tag.replace(/\W/g, "")}_4`, 4900);
  check(t("REPLAY: a payment of the wrong amount is refused and the order stays open"), mismatch === "amount_mismatch" && (await rows()) === before + 2
    && (await q(`select status from public.wallet_topup_orders where order_id = $1`, [o4]))[0].status === "created", mismatch);
  check(t("REPLAY: an unknown order and empty ids are refused"), (await topup("nope", "pay_x", 10000)) === "unknown_order" && (await q(`select public.record_wallet_topup(null, null, 1) r`))[0].r.result === "invalid");
  const viaApi = await as("authenticated", id.proA, `select public.record_wallet_topup($1, 'pay_self', 10000)`, [o4]);
  const viaAnon = await as("anon", null, `select public.record_wallet_topup($1, 'pay_self', 10000)`, [o4]);
  check(t("REPLAY: an app user cannot call the crediting function themselves (only the webhook can)"), denied(viaApi) && denied(viaAnon));
}

async function main() {
  // ═══ PHASE 1: the live database today ═══
  const w1 = await world("today", []);
  try {
    await common(w1, "TODAY");
    const { q, as, book } = w1;
    const comp = await book(id.c2, { status: "completed", payment_status: "paid", completed_at: "2020-01-01T00:00:00Z" });
    check("TODAY W1: HOLE: a customer can create a booking that is already 'completed' for any approved pro", !comp.error && !!comp.id, comp.error?.message);
    const row = (await q(`select status, payment_status, completed_at from public.bookings where id = $1`, [comp.id]))[0];
    check("TODAY W1: HOLE: ...and it is stored as 'paid' with a completion time the customer chose", row?.status === "completed" && row?.payment_status === "paid" && row?.completed_at !== null, JSON.stringify(row));
    const rev = await as("authenticated", id.c2, `insert into public.reviews (provider_id, customer_id, rating, booking_id) values ($1, $2, 1, $3)`, [id.spA, id.c2, comp.id]);
    check("TODAY W1: HOLE: ...which lets that customer review (or revenge-rate) the pro without any job (the fee is never charged either)", !rev.error, rev.error?.message);
    const forced = await book(id.c2, { status: "confirmed", provider_id: id.spB });
    check("TODAY W1: HOLE: a booking can be born 'confirmed' to force a job onto a pro who never accepted", !forced.error && !!forced.id, forced.error?.message);
    const forged = await book(id.c2, { dispatch_state: "searching", created_at: "2020-01-01T00:00:00Z", arrived_at: "2020-01-01T00:00:00Z", coupon_code: "FREE" });
    const fr = (await q(`select dispatch_state, created_at, arrived_at, coupon_code from public.bookings where id = $1`, [forged.id]))[0];
    check("TODAY W1: HOLE: dispatch state, created_at, arrival evidence and coupon can be forged on insert", fr?.dispatch_state === "searching" && fr?.coupon_code === "FREE" && fr?.arrived_at !== null, JSON.stringify(fr));
    const spamOther = await as("authenticated", id.c2, `insert into public.bookings (customer_id, user_id, provider_id, service_id, address) values ($1, $2, $3, $4, 'x') returning id`, [id.c1, id.c2, id.spA, id.svc]);
    check("TODAY M8: HOLE: a booking can be created under someone else's customer_id", !spamOther.error, spamOther.error?.message);
    const bIn = await book(id.c1);
    await w1.server(bIn.id, "in_progress");
    const stolen = await as("authenticated", id.proB, `select public.add_booking_extra($1, 'Parts', 100, 'parts', $2) r`, [bIn.id, `${id.c1}/${id.c2}/9.jpg`]);
    check("TODAY W3: (own-booking check passes only for the booking's pro) a foreign photo path on a booking not yours is refused", stolen.rows[0]?.r?.reason === "unauthorized");
    const mine = await as("authenticated", id.proA, `select public.add_booking_extra($1, 'Parts', 100, 'parts', $2) r`, [bIn.id, `${id.c1}/some-other-booking/9.jpg`]);
    check("TODAY W3: HOLE: a pro can name ANY file path as the bill photo of their extra", mine.rows[0]?.r?.ok === true, JSON.stringify(mine.rows));
  } finally {
    await w1.stop();
  }

  // ═══ PHASE 2: after proposals A, D and E ═══
  const w2 = await world("fixed", [A, D, E]);
  try {
    await common(w2, "FIXED");
    const { q, as, book } = w2;
    for (const status of ["completed", "confirmed", "in_progress", "on_the_way", "cancelled"]) {
      const r = await book(id.c2, { status }, false);
      check(`FIXED W1: a customer cannot create a booking that is already '${status}'`, !!r.error && /must start as pending/.test(r.error.message), r.error?.message);
    }
    const forgedBooking = await book(id.c2, { payment_status: "paid", completed_at: "2020-01-01T00:00:00Z", dispatch_state: "searching", current_ring: 3,
      created_at: "2020-01-01T00:00:00Z", arrived_at: "2020-01-01T00:00:00Z", arrived_lat: 1, coupon_code: "FREE", coupon_discount: 400, final_amount: 1, tracking_active: true,
      unread_messages_provider: 50, provider_eta_minutes: 1, started_at: "2020-01-01T00:00:00Z", cancellation_reason: "x" });
    const f = (await q(`select payment_status, completed_at, dispatch_state, current_ring, created_at > now() - interval '1 minute' as fresh, arrived_at, arrived_lat, coupon_code,
                        coupon_discount, final_amount, tracking_active, unread_messages_provider, provider_eta_minutes, started_at, cancellation_reason, status from public.bookings where id = $1`, [forgedBooking.id]))[0];
    check("FIXED W1: forged server-owned columns on a new booking are reset to their starting values",
      !forgedBooking.error && f.payment_status === "unpaid" && f.completed_at === null && f.dispatch_state === null && f.current_ring === null && f.fresh === true && f.arrived_at === null
      && f.arrived_lat === null && f.coupon_code === null && Number(f.coupon_discount) === 0 && f.final_amount === null && f.tracking_active === false && f.unread_messages_provider === 0
      && f.provider_eta_minutes === null && f.started_at === null && f.cancellation_reason === null && f.status === "pending", JSON.stringify(f) + forgedBooking.error?.message);
    const normal = await book(id.c1, { latitude: 22.47, longitude: 70.05, customer_name: "Meera", customer_phone: "9", special_instructions: "ring the bell", sub_item_name: "x" });
    check("FIXED W1: a normal booking, with everything the app sends, still works", !normal.error && !!normal.id, normal.error?.message);
    const adm = await as("authenticated", id.admin, `insert into public.bookings (customer_id, provider_id, service_id, address, status) values ($1, $2, $3, 'x', 'completed') returning id`, [id.admin, id.spA, id.svc]);
    check("FIXED W1: even an admin signed in to the app cannot create a pre-completed booking (support cases use the SQL editor)", !!adm.error, adm.error?.message);
    const srv = await q(`insert into public.bookings (customer_id, provider_id, service_id, address, status) values ($1, $2, $3, 'x', 'confirmed') returning id`, [id.c1, id.spA, id.svc]);
    check("FIXED W1: the server (dispatch, SQL editor) can still create any booking", srv.length === 1);
    const fakeReview = await as("authenticated", id.c2, `insert into public.reviews (provider_id, customer_id, rating, booking_id) values ($1, $2, 1, $3)`, [id.spA, id.c2, forgedBooking.id]);
    check("FIXED W1: there is no longer a way to get a 'completed' booking without the pro's code, so no fake review", denied(fakeReview) || !!fakeReview.error, fakeReview.error?.message);
    const spamOther = await as("authenticated", id.c2, `insert into public.bookings (customer_id, user_id, provider_id, service_id, address) values ($1, $2, $3, $4, 'x')`, [id.c1, id.c2, id.spA, id.svc]);
    check("FIXED M8: a booking under someone else's customer_id is refused", denied(spamOther), spamOther.error?.message);

    // completion codes: secure source, 4 digits, even spread
    await q(`insert into public.bookings (customer_id, provider_id, service_id, address) select $1, $2, $3, 'x' from generate_series(1, 600)`, [id.c1, id.spA, id.svc]);
    const codes = await q(`select code from public.booking_completion_codes`);
    const lead = new Array(10).fill(0);
    for (const c of codes) lead[Number(c.code[0])] += 1;
    const lo = Math.min(...lead), hi = Math.max(...lead), mean = codes.length / 10;
    check("FIXED W2: every completion code is 4 digits", codes.every((c) => /^\d{4}$/.test(c.code)), String(codes.length));
    check("FIXED W2: the first digit is spread evenly over 0-9 (no digit favoured)", lo > mean * 0.55 && hi < mean * 1.45, lead.join(","));
    check("FIXED W2: codes are not all different by accident of a tiny range (many distinct values)", new Set(codes.map((c) => c.code)).size > 450, String(new Set(codes.map((c) => c.code)).size));

    // bill photo path
    const bIn = await book(id.c1);
    await w2.server(bIn.id, "in_progress");
    const foreign = await as("authenticated", id.proA, `select public.add_booking_extra($1, 'Parts', 100, 'parts', $2) r`, [bIn.id, `${id.c1}/some-other-booking/9.jpg`]);
    const otherBooking = await as("authenticated", id.proA, `select public.add_booking_extra($1, 'Parts', 100, 'parts', $2) r`, [bIn.id, `${id.proA}/${id.svc}/9.jpg`]);
    const goodPath = await as("authenticated", id.proA, `select public.add_booking_extra($1, 'Parts', 100, 'parts', $2) r`, [bIn.id, `${id.proA}/${bIn.id}/1730000000.jpg`]);
    const labour = await as("authenticated", id.proA, `select public.add_booking_extra($1, 'Labour', 100, 'labour') r`, [bIn.id]);
    const tricky = await as("authenticated", id.proA, `select public.add_booking_extra($1, 'Parts', 100, 'parts', $2) r`, [bIn.id, `${id.proA}/${bIn.id}/../../${id.c1}/secret.jpg`]);
    check("FIXED W3: a bill photo path in someone else's folder is refused", foreign.rows[0]?.r?.reason === "invalid_photo", JSON.stringify(foreign.rows));
    check("FIXED W3: ...and one in the pro's own folder but for a different booking", otherBooking.rows[0]?.r?.reason === "invalid_photo");
    check("FIXED W3: the path the app really builds (<auth id>/<booking id>/<time>.jpg) still works, and labour needs no photo", goodPath.rows[0]?.r?.ok === true && labour.rows[0]?.r?.ok === true, JSON.stringify([goodPath.rows, labour.rows]));
    check("FIXED W3: a path that starts correctly but climbs out with '..' is refused", tricky.rows[0]?.r?.reason === "invalid_photo", JSON.stringify(tricky.rows));
  } finally {
    await w2.stop();
  }
}

/** The dry-run and apply files for proposal E: same body as the proposal, the dry run passes its own checks and saves nothing, re-running is safe. */
async function files() {
  const body = P(E).trim();
  const d = readFileSync(`${repo}/supabase/dryrun/29_booking_integrity_DRYRUN.sql`, "utf8");
  const a = readFileSync(`${repo}/supabase/dryrun/apply_29_booking_integrity_COMMIT.sql`, "utf8");
  check("E-files: dry-run and apply files carry the proposal unchanged, ending in ROLLBACK / COMMIT", d.includes(body) && a.includes(body) && d.trimEnd().endsWith("ROLLBACK;") && a.trimEnd().endsWith("COMMIT;"));
  const w = await world("e-dry", []);
  try {
    const res = await w.c.query(d);
    const row = (Array.isArray(res) ? res : [res]).filter((r) => r.command === "SELECT" && r.rows.length).pop()?.rows[0] ?? {};
    check("E-dry: the dry run runs fully and every check is true", Object.keys(row).length > 0 && Object.values(row).every((v) => v === true), JSON.stringify(row));
    const left = await w.q(`select count(*)::int n from pg_trigger where tgname = 'zz_guard_booking_insert'`);
    check("E-dry: the dry run saved nothing (ROLLBACK)", left[0].n === 0);
    await w.q(P(E));
    await w.q(P(E));
    check("E: the proposal applies twice without error (re-run safe)", true);
  } finally {
    await w.stop();
  }
}

try {
  await main();
  await files();
} catch (e) {
  check("attack walkthrough crashed", false, e.stack ?? String(e));
}
finish();
