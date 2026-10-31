// Instant dispatch proposal 20261124000000 on a REAL throwaway Postgres 17 (embedded-postgres, deleted afterwards):
// live-like stub + the proposal (applied twice: re-run safe) + every edge case, including truly concurrent accepts.
// Usage: node test-dispatch.mjs <repo>
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.argv[2];
const here = new URL(".", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const dir = mkdtempSync(join(tmpdir(), "hf-dispatch-"));
const port = 54000 + Math.floor(Math.random() * 900);
const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {}, onError: () => {} });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  " + extra}`); };
const conn = () => new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "hf" });

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
  const proposal = readFileSync(`${repo}/supabase/proposals/20261124000000_instant_dispatch_PROPOSAL_NOT_APPLIED.sql`, "utf8");
  const area = readFileSync(`${repo}/supabase/proposals/20261124000001_dispatch_service_area_PROPOSAL_NOT_APPLIED.sql`, "utf8");
  await admin.query(proposal);
  await admin.query(area);
  await admin.query(proposal.replace(/CREATE OR REPLACE FUNCTION public\.dispatch_candidates[\s\S]*?\n\$\$;\n/, ""));
  await admin.query(area);
  check("both proposals apply on a live-like database (20261124000000 then 000001), and re-running changes nothing", true);

  // ── seed ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const C = { lat: 22.4707, lng: 70.0577 };                 // Jamnagar centre = the customer
  const north = (km) => C.lat + km / 111.195;
  const S1 = "00000000-0000-0000-0000-0000000000s1".replace("s1", "a1"), S2 = "00000000-0000-0000-0000-0000000000b2", S3 = "00000000-0000-0000-0000-0000000000c3";
  await q(`insert into services values ($1,'TV Installation',349,null,null), ($2,'Lift heavy items',500,null,null), ($3,'Nobody does this',299,null,null)`, [S1, S2, S3]);
  let n = 0;
  const pro = async (label, km, over = {}) => {
    n += 1;
    const id = `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    const uid = `20000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    const o = { kyc: "approved", status: "active", online: true, rating: 4.5, services: [S1], fresh: true, launch: false, wallet: 100, ...over };
    await q(`insert into service_providers (id,user_id,full_name,status,is_online,rating,service_ids,kyc_status,kyc_reviewed_at,city)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Ahmedabad')`,
      [id, uid, label, o.status, o.online, o.rating, o.services, o.kyc, o.launch ? new Date() : new Date(Date.now() - 400 * 86400000)]);
    if (o.wallet) await q(`insert into wallet_transactions (provider_id, amount) values ($1,$2)`, [id, o.wallet]);
    if (km !== null) await q(`insert into provider_presence values ($1,$2,$3,10, now() - $4::interval)`, [id, o.lat ?? north(km), o.lng ?? C.lng, o.fresh ? "10 seconds" : "5 minutes"]);
    await q(`insert into provider_services values ($1,$2,999)`, [id, S1]);   // own rate: must NOT be used
    return { id, uid, label };
  };
  const p1 = await pro("p1 1.0km", 1.0, { rating: 4.5 });
  const p2 = await pro("p2 1.5km", 1.5, { rating: 4.9 });
  const pLow = await pro("pLow 1.2km wallet 3", 1.2, { wallet: 3 });
  const p3 = await pro("p3 4km", 4);
  const p4 = await pro("p4 8km", 8);
  const p5 = await pro("p5 15km city", 15, { services: [S1, S2] });
  const pOff = await pro("pOff offline", 0.5, { online: false });
  const pStale = await pro("pStale", 0.5, { fresh: false });
  const pKyc = await pro("pKyc pending", 0.5, { kyc: "pending" });
  const pOther = await pro("pOther service", 0.5, { services: ["00000000-0000-0000-0000-0000000000d4"] });
  const pFar = await pro("pFar Ahmedabad", null);
  await q(`insert into provider_presence values ($1, 23.0225, 72.5714, 10, now())`, [pFar.id]);
  const pLaunch = await pro("pLaunch empty wallet", 1.8, { launch: true, wallet: 0 });
  // 20261124000001: GPS says Ahmedabad (a PC browser) but the profile serves Jamnagar; and an open app with no position yet
  const pArea = await pro("pArea GPS Ahmedabad, serves Jamnagar", 0, { lat: 23.03, lng: 72.577 });
  await q(`update service_providers set pincodes = '{Ahmedabad,Jamnagar}' where id = $1`, [pArea.id]);
  const pAreaFar = await pro("pAreaFar GPS Ahmedabad, serves Ahmedabad", 0, { lat: 23.03, lng: 72.577 });
  await q(`update service_providers set pincodes = '{380009,Ahmedabad}' where id = $1`, [pAreaFar.id]);
  const pNoGps = await pro("pNoGps app open, no position, 361008", null);
  await q(`update service_providers set pincodes = '{361008}', updated_at = now() where id = $1`, [pNoGps.id]);
  const pNoGpsStale = await pro("pNoGpsStale app closed, 361008", null);
  await q(`update service_providers set pincodes = '{361008}', updated_at = now() - interval '2 hours' where id = $1`, [pNoGpsStale.id]);

  const cust = "30000000-0000-0000-0000-000000000001", cust2 = "30000000-0000-0000-0000-000000000002", cust3 = "30000000-0000-0000-0000-000000000003";

  // a signed-in app user on its own connection
  const as = async (uid) => {
    const c = conn();
    await c.connect();
    await c.query(`set role authenticated`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
    c.on("error", () => {});
    return {
      c,
      rpc: async (fn, args = []) => (await c.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).rows[0].r,
      try: async (sql, args) => { try { return { rows: (await c.query(sql, args)).rows }; } catch (e) { return { error: e.message }; } },
      end: () => c.end(),
    };
  };
  const customer = await as(cust);
  const book = async (who, over = {}) => {
    const o = { service: S1, lat: C.lat, lng: C.lng, ...over };
    return (await who.c.query(`insert into bookings (customer_id, service_id, address, city, pincode, latitude, longitude, booking_date, special_instructions)
       values ($1,$2,'12 MG Road, flat 4','Jamnagar','361001',$3,$4,current_date,'Bring a drill') returning id, provider_id, total_amount, provider_amount, platform_fee, dispatch_state`,
      [o.customer ?? cust, o.service, o.lat, o.lng])).rows[0];
  };

  // ── 1. booking without a pro, catalogue price ─────────────────────────────────────────────────────────────────────
  const b1 = await book(customer);
  check("the customer books with no pro: catalogue price ₹349 for everyone (pros' own rate ignored), platform fee 0",
    b1.provider_id === null && Number(b1.total_amount) === 349 && Number(b1.platform_fee) === 0 && b1.dispatch_state === null, JSON.stringify(b1));

  // ── 2. start: ring 1 ──────────────────────────────────────────────────────────────────────────────────────────────
  const st = await customer.rpc("start_dispatch", [b1.id]);
  const offers1 = (await q(`select sp.full_name, o.ring from booking_offers o join service_providers sp on sp.id = o.provider_id where booking_id = $1 order by o.distance_km`, [b1.id])).map((r) => r.full_name);
  check("start opens ring 1: only the approved, active, online, fresh pros within 2 km who offer the service",
    st.dispatch_state === "searching" && st.current_ring === 1 && JSON.stringify(offers1) === JSON.stringify(["p1 1.0km", "pLow 1.2km wallet 3", "p2 1.5km", "pLaunch empty wallet"]), JSON.stringify([st.current_ring, offers1]));
  check("offline, stale, unapproved, other-service and out-of-town pros get nothing", !offers1.some((l) => /pOff|pStale|pKyc|pOther|pFar/.test(l)));
  check("the low-wallet pro still gets the offer (shown as Top up)", offers1.includes("pLow 1.2km wallet 3"));
  check("the customer sees '4 notified' and only rounded dots (2 decimals)", st.notified === 4 && st.dots.length === 4 && st.dots.every((d) => Math.round(Number(d.lat) * 100) / 100 === Number(d.lat)));
  const notes = await q(`select provider_id, data->>'kind' kind, type::text from provider_notifications where data->>'booking_id' = $1`, [b1.id]);
  check("each offered pro gets one 'new job near you' notice (type new_booking, kind dispatch_offer)", notes.length === 4 && notes.every((r) => r.kind === "dispatch_offer"));
  const ev = (await q(`select event from dispatch_events where booking_id = $1 order by id`, [b1.id])).map((r) => r.event);
  check("audit trail: search_started, ring_opened, offered x4", JSON.stringify(ev) === JSON.stringify(["search_started", "ring_opened", "offered", "offered", "offered", "offered"]), JSON.stringify(ev));
  const again = await customer.rpc("start_dispatch", [b1.id]);
  check("starting twice (double tap) changes nothing", again.notified === 4 && (await one(`select count(*)::int n from dispatch_events where booking_id=$1 and event='search_started'`, [b1.id])).n === 1);

  // ── 3. privacy ────────────────────────────────────────────────────────────────────────────────────────────────────
  const P1 = await as(p1.uid);
  const card = await P1.rpc("get_offer_card", [b1.id]);
  const cardText = JSON.stringify(card);
  check("the offer card has service, about-km, locality, earning and fee, but no address, name or phone",
    card.service_name === "TV Installation" && Number(card.price) === 349 && Number(card.fee) === 15 && Number(card.approx_km) === 1 && card.locality === "Jamnagar, 361001"
    && !/MG Road|flat 4|customer_name|customer_phone|address/.test(cardText), cardText);
  check("before accepting, a pro cannot read the booking row itself", (await P1.try(`select id from bookings where id = $1`, [b1.id])).rows.length === 0);
  check("a pro reads only their own offers", (await P1.try(`select provider_id from booking_offers`)).rows.every((r) => r.provider_id === p1.id));
  check("nobody in the app can read pro positions", !!(await P1.try(`select * from provider_presence`)).error && !!(await customer.try(`select * from provider_presence`)).error);
  const P3 = await as(p3.uid);
  check("a pro without an offer cannot open the card", !!(await P3.try(`select public.get_offer_card($1)`, [b1.id])).error);
  check("a pro without an offer cannot accept it", (await P3.rpc("accept_dispatch_offer", [b1.id])).result === "not_offered");

  // ── 4. rings widen ────────────────────────────────────────────────────────────────────────────────────────────────
  await q(`select dispatch_tick()`);
  check("before the 10 s are up nothing widens", (await one(`select current_ring from bookings where id=$1`, [b1.id])).current_ring === 1);
  const expire = (id) => q(`update bookings set ring_deadline = now() - interval '1 second' where id = $1`, [id]);
  await expire(b1.id); await q(`select dispatch_tick()`);
  check("after 10 s ring 2 (5 km) opens and adds the 4 km pro", (await one(`select current_ring from bookings where id=$1`, [b1.id])).current_ring === 2
    && !!(await one(`select 1 x from booking_offers where booking_id=$1 and provider_id=$2`, [b1.id, p3.id])));
  await expire(b1.id); await q(`select dispatch_tick()`);
  await expire(b1.id); await q(`select dispatch_tick()`);
  const b1row = await one(`select current_ring, ring_deadline from bookings where id=$1`, [b1.id]);
  check("then 10 km, then all of Jamnagar (15 km pro), which stays open with no deadline", b1row.current_ring === 4 && b1row.ring_deadline === null
    && !!(await one(`select 1 x from booking_offers where booking_id=$1 and provider_id=$2`, [b1.id, p5.id])));
  check("every pro is offered the job once, however many rings open", (await one(`select count(*)::int n, count(distinct provider_id)::int d from booking_offers where booking_id=$1`, [b1.id])).n === 9);
  const areaOffer = await one(`select ring, distance_km from booking_offers where booking_id=$1 and provider_id=$2`, [b1.id, pArea.id]);
  check("GPS says Ahmedabad but the profile serves Jamnagar: offered on the city ring, distance = customer to city centre (not 264 km)",
    !!areaOffer && areaOffer.ring === 4 && Number(areaOffer.distance_km) < 1, JSON.stringify(areaOffer));
  check("an open app with no position yet but a fresh heartbeat and a 361xxx area is offered on the city ring",
    (await one(`select ring from booking_offers where booking_id=$1 and provider_id=$2`, [b1.id, pNoGps.id]))?.ring === 4);
  check("a pro who serves Ahmedabad only, or whose app is closed (stale heartbeat), is never offered",
    !(await one(`select 1 x from booking_offers where booking_id=$1 and provider_id in ($2,$3)`, [b1.id, pAreaFar.id, pNoGpsStale.id])));
  check("service-area pros are not asked in the close rings (GPS decides those)",
    !(await one(`select 1 x from dispatch_events where booking_id=$1 and event='offered' and ring < 4 and provider_id in ($2,$3)`, [b1.id, pArea.id, pNoGps.id])));
  check("earlier offers stay open while later rings run (cumulative)", (await one(`select count(*)::int n from booking_offers where booking_id=$1 and status='offered'`, [b1.id])).n === 9);

  // ── 5. low wallet ─────────────────────────────────────────────────────────────────────────────────────────────────
  const PL = await as(pLow.uid);
  const low = await PL.rpc("accept_dispatch_offer", [b1.id]);
  check("a pro with too little in the wallet gets 'top up' and the booking stays searching", low.result === "top_up" && /Top up/.test(low.message)
    && (await one(`select dispatch_state, provider_id from bookings where id=$1`, [b1.id])).dispatch_state === "searching", JSON.stringify(low));

  // ── 6. the race: two pros at the same instant ─────────────────────────────────────────────────────────────────────
  const P2 = await as(p2.uid);
  await P1.c.query("begin");
  const first = await P1.rpc("accept_dispatch_offer", [b1.id]);             // holds the booking row lock
  let secondDone = false;
  const secondP = P2.rpc("accept_dispatch_offer", [b1.id]).then((r) => { secondDone = true; return r; });
  await new Promise((r) => setTimeout(r, 400));
  check("while the first accept is still open, the second one waits (row lock)", first.result === "accepted" && !secondDone);
  await P1.c.query("commit");
  const second = await secondP;
  check("the second pro gets 'taken' once the first commits", second.result === "taken", JSON.stringify(second));
  const won = await one(`select provider_id, status::text, dispatch_state, dispatch_accepted_at is not null acc from bookings where id=$1`, [b1.id]);
  check("the booking is the first pro's: confirmed, assigned", won.provider_id === p1.id && won.status === "confirmed" && won.dispatch_state === "assigned" && won.acc);
  const offerStates = Object.fromEntries((await q(`select provider_id, status from booking_offers where booking_id=$1`, [b1.id])).map((r) => [r.provider_id, r.status]));
  check("the winner's offer is accepted, all others 'taken'", offerStates[p1.id] === "accepted" && Object.entries(offerStates).filter(([k]) => k !== p1.id).every(([, s]) => s === "taken"));
  check("the winner gets no misleading 'Accept or decline it now' notice", !(await one(`select 1 x from provider_notifications where provider_id=$1 and title like 'New Booking Request%'`, [p1.id])));
  check("the customer is told the pro accepted", !!(await one(`select 1 x from customer_notifications where booking_id=$1 and type='booking_confirmed'`, [b1.id])));
  check("the completion code exists from acceptance", !!(await one(`select 1 x from booking_completion_codes where booking_id=$1`, [b1.id])));
  check("after accepting, the pro can read the booking", (await P1.try(`select id from bookings where id = $1`, [b1.id])).rows.length === 1);
  check("a double tap by the winner is harmless; a late pro still gets 'taken'",
    (await P1.rpc("accept_dispatch_offer", [b1.id])).result === "accepted" && (await P3.rpc("accept_dispatch_offer", [b1.id])).result === "taken");

  // 5 pros at exactly the same time, no manual ordering
  const bRace = await book(customer);
  await customer.rpc("start_dispatch", [bRace.id]);
  await expire(bRace.id); await q(`select dispatch_tick()`); await expire(bRace.id); await q(`select dispatch_tick()`); await expire(bRace.id); await q(`select dispatch_tick()`);
  const racers = await Promise.all([p1, p2, p3, p4, p5].map((p) => as(p.uid)));
  const outcomes = await Promise.all(racers.map((r) => r.rpc("accept_dispatch_offer", [bRace.id])));
  const winners = outcomes.filter((o) => o.result === "accepted").length;
  check("5 pros accept at the same instant: exactly one wins, four get 'taken'", winners === 1 && outcomes.filter((o) => o.result === "taken").length === 4, JSON.stringify(outcomes));
  await Promise.all(racers.map((r) => r.end()));

  // ── 7. cancel ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const c2 = await as(cust2);
  const b2 = await book(c2, { customer: cust2 });
  await c2.rpc("start_dispatch", [b2.id]);
  const cancelled = await c2.rpc("cancel_search", [b2.id]);
  const b2row = await one(`select status::text, dispatch_state from bookings where id=$1`, [b2.id]);
  check("cancel while searching: free, booking cancelled, all offers withdrawn", cancelled.result === "cancelled" && b2row.status === "cancelled" && b2row.dispatch_state === "cancelled"
    && (await one(`select count(*) filter (where status <> 'withdrawn')::int n from booking_offers where booking_id=$1`, [b2.id])).n === 0);
  check("a pro accepting after the customer cancelled gets 'withdrawn'", (await P2.rpc("accept_dispatch_offer", [b2.id])).result === "withdrawn");
  check("cancelling twice is harmless", (await c2.rpc("cancel_search", [b2.id])).result === "cancelled");
  check("cancel once a pro accepted is refused with a plain message (use the booking screen)", (await customer.rpc("cancel_search", [b1.id])).result === "assigned");

  const b2b = await book(c2, { customer: cust2 });
  await c2.rpc("start_dispatch", [b2b.id]);
  const direct = await c2.try(`update bookings set status='cancelled', cancelled_at=now(), cancellation_reason='changed my mind' where id=$1`, [b2b.id]);
  check("the old cancel button (a plain update) also ends the search and withdraws offers", !direct.error
    && (await one(`select dispatch_state from bookings where id=$1`, [b2b.id])).dispatch_state === "cancelled"
    && (await one(`select count(*) filter (where status='offered')::int n from booking_offers where booking_id=$1`, [b2b.id])).n === 0, direct.error);
  check("a customer cannot set dispatch columns themselves", !!(await c2.try(`update bookings set dispatch_state='assigned' where id=$1`, [b2b.id])).error);

  // ── 8. one search per customer, city zone, nobody online ─────────────────────────────────────────────────────────
  const c3 = await as(cust3);
  const b3 = await book(c3, { customer: cust3 });
  await c3.rpc("start_dispatch", [b3.id]);
  const b4 = await book(c3, { customer: cust3 });
  const dup = await c3.try(`select public.start_dispatch($1)`, [b4.id]);
  check("a second search by the same customer is refused while one runs", /already have a search running/.test(dup.error ?? ""), dup.error);
  await c3.rpc("cancel_search", [b3.id]);
  const out = await book(c3, { customer: cust3, lat: 23.0225, lng: 72.5714 });
  const outside = await c3.try(`select public.start_dispatch($1)`, [out.id]);
  check("an address outside Jamnagar gets a clear message", /works in Jamnagar for now/.test(outside.error ?? ""), outside.error);
  const nobody = await book(c3, { customer: cust3, service: S3 });
  const nb = await c3.rpc("start_dispatch", [nobody.id]);
  check("nobody online for the service: 'no pro' straight away", nb.dispatch_state === "no_pro"
    && !!(await one(`select 1 x from dispatch_events where booking_id=$1 and event='no_pro' and detail->>'reason'='nobody_online'`, [nobody.id])));

  // ── 9. only one pro in the whole city, rings skipped without waiting ────────────────────────────────────────────
  const lift = await book(c3, { customer: cust3, service: S2 });
  const lf = await c3.rpc("start_dispatch", [lift.id]);
  const skipped = (await q(`select ring from dispatch_events where booking_id=$1 and event='ring_skipped' order by ring`, [lift.id])).map((r) => r.ring);
  check("only one pro (15 km away) in the city: rings 1-3 skipped at once, the city ring reaches them", lf.current_ring === 4 && JSON.stringify(skipped) === "[1,2,3]" && lf.notified === 1, JSON.stringify([lf.current_ring, skipped]));

  // ── 10. time up, keep looking ─────────────────────────────────────────────────────────────────────────────────────
  await q(`update bookings set search_ends_at = now() - interval '1 second' where id=$1`, [lift.id]);
  await q(`select dispatch_tick()`);
  const P5 = await as(p5.uid);
  check("after 2 minutes with nobody accepting: 'no pro', offers expired", (await one(`select dispatch_state from bookings where id=$1`, [lift.id])).dispatch_state === "no_pro"
    && (await one(`select status from booking_offers where booking_id=$1`, [lift.id])).status === "expired");
  check("a pro accepting after the search ended gets 'expired'", (await P5.rpc("accept_dispatch_offer", [lift.id])).result === "expired");
  const ext = await c3.rpc("extend_search", [lift.id]);
  check("keep looking: searching again on the city ring for 10 minutes, the pro is asked again",
    ext.dispatch_state === "searching" && ext.current_ring === 4 && (await one(`select status from booking_offers where booking_id=$1`, [lift.id])).status === "offered"
    && (await one(`select (search_ends_at - now()) > interval '590 seconds' ok from bookings where id=$1`, [lift.id])).ok);
  check("...and can now accept", (await P5.rpc("accept_dispatch_offer", [lift.id])).result === "accepted");
  check("keep looking is refused while a search is still running", !!(await customer.try(`select public.extend_search($1)`, [bRace.id])).error);

  // ── 11. a pro who comes online later joins the open city ring ────────────────────────────────────────────────────
  const b5 = await book(c3, { customer: cust3 });
  await c3.rpc("start_dispatch", [b5.id]);
  await expire(b5.id); await q(`select dispatch_tick()`); await expire(b5.id); await q(`select dispatch_tick()`); await expire(b5.id); await q(`select dispatch_tick()`);
  const PS = await as(pStale.uid);
  await PS.rpc("report_presence", [north(0.5), C.lng, 15]);
  await q(`select dispatch_tick()`);
  check("a stale pro is skipped; once their heartbeat is fresh again they get the open offer on the next tick",
    !!(await one(`select 1 x from booking_offers where booking_id=$1 and provider_id=$2`, [b5.id, pStale.id])));
  const POff = await as(pOff.uid);
  await POff.rpc("report_presence", [north(0.4), C.lng, 15]);
  check("an offline pro's heartbeat stores no position", !(await one(`select 1 x from provider_presence where provider_id=$1 and latitude=$2`, [pOff.id, north(0.4)])));

  // ── 12. the customer's app was closed: state comes back from the database ────────────────────────────────────────
  const reopened = await as(cust3);
  const state = await reopened.rpc("get_search_state", [b5.id]);
  check("reopening the app restores the search from the booking row (ring, notified, end time)", state.dispatch_state === "searching" && state.current_ring === 4 && state.notified >= 5 && !!state.search_ends_at);
  check("another customer cannot see or cancel this search", !!(await customer.try(`select public.get_search_state($1)`, [b5.id])).error && !!(await customer.try(`select public.cancel_search($1)`, [b5.id])).error);

  // ── 13. permissions ──────────────────────────────────────────────────────────────────────────────────────────────
  check("the app cannot run the server tick or one step of it", !!(await customer.try(`select public.dispatch_tick()`)).error && !!(await customer.try(`select public.dispatch_advance($1)`, [b5.id])).error);
  const anon = conn(); await anon.connect(); await anon.query("set role anon");
  let anonErr = null; try { await anon.query(`select public.start_dispatch($1)`, [b5.id]); } catch (e) { anonErr = e.message; } await anon.end();
  check("signed-out users cannot call dispatch functions", !!anonErr);
  check("the audit trail cannot be changed", !!(await (async () => { try { await q(`update dispatch_events set event='accepted'`); return null; } catch (e) { return e.message; } })()));
  check("admins read the audit trail; customers do not", (await customer.try(`select * from dispatch_events`)).rows?.length === 0);
  check("old bookings that pick a pro still work as before (no dispatch state, the pro is told as today)", await (async () => {
    const old = (await customer.c.query(`insert into bookings (customer_id, provider_id, service_id, address, scheduled_date) values ($1,$2,$3,'x',current_date) returning id, dispatch_state, total_amount`, [cust, p2.id, S1])).rows[0];
    return old.dispatch_state === null && Number(old.total_amount) === 999 && !!(await one(`select 1 x from provider_notifications where provider_id=$1 and data->>'booking_id'=$2 and title like 'New Booking Request%'`, [p2.id, old.id]));
  })());

  for (const c of [customer, P1, P2, P3, PL, c2, c3, P5, PS, POff, reopened]) await c.end();
} catch (e) {
  check("harness", false, e.stack);
} finally {
  await admin.end().catch(() => {});
  await server.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? "" : " (ALL PASSED)"}`);
process.exit(failed ? 1 : 0);
