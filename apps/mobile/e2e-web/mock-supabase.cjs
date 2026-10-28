// Fake Supabase HTTP API used by the web e2e tests (auth.v1, rest.v1, functions.v1).
// Everything lives in memory, so each test run starts clean.
const BASE = process.env.E2E_BASE_URL || "http://localhost:8099";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub, email) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, email, role: "authenticated", aud: "authenticated", exp: 4102444800 })}.sig`;

// ── fake backend state ───────────────────────────────────────────────────────
const db = { tables: {}, users: {}, providerRows: [], profiles: [], bookings: 0, verified: new Set(), calls: [], storedBookings: [], pricingMode: "pdf", locations: [], wallet: { available: 0, dues: 0 }, ledger: [], payouts: [], minPayout: 200, payoutDetails: true, launchActive: true, serverWalletRule: true, sockets: [], completionCode: "4321" };
let nextId = 1;
const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email" }, user_metadata: u.meta, created_at: "2026-01-01T00:00:00Z" });
const sessionJson = (u) => ({ access_token: jwt(u.id, u.email), refresh_token: "r-" + u.id, expires_in: 3600, expires_at: 4102444800, token_type: "bearer", user: userJson(u) });
const userFromAuth = (req) => {
  const tok = (req.headers()["authorization"] || "").replace("Bearer ", "");
  try { const sub = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()).sub; return Object.values(db.users).find((u) => u.id === sub) || null; } catch { return null; }
};

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept-profile, content-profile, range, accept, x-client-version", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS", "access-control-expose-headers": "content-range" };
const json = (route, status, body, extra = {}) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });


// ── catalogue fixtures ────────────────────────────────────────────────────────
db.services = [
  { id: "s-plumb", name: "Plumbing", slug: "plumbing", description: "Pipe repairs, leaks, installations", icon_name: "Wrench", base_price: 299, duration_minutes: 60, category: "home" },
  { id: "s-clean", name: "House Cleaning", slug: "cleaning", description: "Deep clean, regular maintenance", icon_name: "Sparkles", base_price: 499, duration_minutes: 120, category: "home" },
];
db.subItems = [
  { id: "si-tap", service_id: "s-plumb", name: "Tap repair", description: "Leaking or broken tap", icon: "🚰", base_price: 199, duration_minutes: 45 },
  { id: "si-leak", service_id: "s-plumb", name: "Pipe leak", description: "Leak in a pipe or joint", icon: "💧", base_price: 349, duration_minutes: 60, price_min: 249, price_max: 449 },
];
// Pros' ticked jobs (proposal 20261113). Empty = every pro does every job at the catalogue price.
db.providerSubItems = [];
// mirrors fee_for_service_bill / recharge_pack_for in proposal 20261114 (3%, min 5, max 50; packs 49/99/199)
const fee3 = (amount) => (amount > 0 ? Math.min(50, Math.max(5, Math.floor((Math.round(amount * 100) * 3 + 5000) / 10000))) : 0);
const packFor = (need) => (need <= 49 ? 49 : need <= 99 ? 99 : 199);
db.holds = {};
db.wallet.held = 0;
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
// presence is evaluated against "now" at request time, so a fresh heartbeat is always "just now"
db.publicProviders = () => [
  { id: "p-asha", full_name: "Asha Patel", avatar_url: null, bio: "Ten years fixing leaks.", rating: 4.8, total_reviews: 120, total_jobs: 210, experience_years: 10, pincodes: ["Gandhinagar", "382010"], service_ids: ["s-plumb", "s-clean"], is_online: true, is_verified: true, is_email_verified: true, city: "Gandhinagar", updated_at: minsAgo(0.2) },
  { id: "p-ravi", full_name: "Ravi Shah", avatar_url: null, bio: null, rating: 4.2, total_reviews: 30, total_jobs: 45, experience_years: 3, pincodes: ["Gandhinagar"], service_ids: ["s-plumb", "s-clean"], is_online: true, is_verified: false, is_email_verified: false, city: "Gandhinagar", updated_at: minsAgo(0.5) },
  { id: "p-offline", full_name: "Offline Oli", avatar_url: null, bio: null, rating: 5, total_reviews: 9, total_jobs: 9, experience_years: 1, pincodes: ["Gandhinagar"], service_ids: ["s-plumb"], is_online: false, is_verified: true, is_email_verified: true, city: "Gandhinagar", updated_at: minsAgo(0.1) },
  { id: "p-stale", full_name: "Stale Sam", avatar_url: null, bio: null, rating: 5, total_reviews: 9, total_jobs: 9, experience_years: 1, pincodes: ["Gandhinagar"], service_ids: ["s-plumb"], is_online: true, is_verified: true, is_email_verified: true, city: "Gandhinagar", updated_at: minsAgo(10) },
  { id: "p-surat", full_name: "Surat Suresh", avatar_url: null, bio: null, rating: 4.9, total_reviews: 80, total_jobs: 99, experience_years: 6, pincodes: ["Surat"], service_ids: ["s-plumb", "s-clean"], is_online: true, is_verified: true, is_email_verified: true, city: "Surat", updated_at: minsAgo(0.3) },
];
db.providerServices = [
  { provider_id: "p-asha", service_id: "s-plumb", custom_price: 349 },
  { provider_id: "p-ravi", service_id: "s-plumb", custom_price: 279 },
  { provider_id: "p-asha", service_id: "s-clean", custom_price: 599 },
  { provider_id: "p-ravi", service_id: "s-clean", custom_price: 449 },
  { provider_id: "p-surat", service_id: "s-plumb", custom_price: 399 },
];

async function installMock(page) {
  await page.route("https://mock.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    db.calls.push(`${m} ${p}${url.search.slice(0, 60)}`);
    db.wallet.held = db.wallet.held || 0; // suites replace db.wallet without it
    const body = () => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } };

    if (p === "/auth/v1/signup") {
      const b = body();
      if (db.users[b.email]) return json(route, 422, { code: "user_already_exists", msg: "User already registered" });
      const u = { id: "u-" + nextId++, email: b.email, password: b.password, meta: b.data || {} };
      db.users[b.email] = u;
      return json(route, 200, sessionJson(u));
    }
    if (p === "/auth/v1/token") {
      const b = body();
      const u = db.users[b.email];
      if (!u || u.password !== b.password) return json(route, 400, { code: "invalid_credentials", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
      return json(route, 200, sessionJson(u));
    }
    if (p === "/auth/v1/user") {
      const u = userFromAuth(req);
      if (!u) return json(route, 401, { msg: "invalid JWT" });
      if (m === "PUT") { const b = body(); if (b.data) u.meta = { ...u.meta, ...b.data }; if (b.password) u.password = b.password; }
      return json(route, 200, userJson(u));
    }
    if (p === "/auth/v1/logout") return route.fulfill({ status: 204, headers: CORS });
    if (p === "/auth/v1/recover") return json(route, 200, {});
    if (p === "/rest/v1/service_providers") {
      const u = userFromAuth(req);
      if (m === "POST") { db.providerRows.push({ ...body(), id: "p-" + nextId++ }); return route.fulfill({ status: 201, headers: CORS }); }
      if (m === "PATCH") {
        const id = (url.searchParams.get("id") || "").replace("eq.", "");
        const row = db.providerRows.find((r) => r.id === id);
        const patch = body();
        if (row) {
          Object.assign(row, patch);
          // like the live trigger: only an approved, active pro can actually be online
          if (patch.is_online && !(row.status === "active" && row.kyc_status === "approved")) row.is_online = false;
          db.heartbeats = (db.heartbeats || 0) + 1;
        }
        const wantsRows = (req.headers()["prefer"] || "").includes("return=representation");
        return wantsRows ? json(route, 200, row ? [row] : []) : route.fulfill({ status: 204, headers: CORS });
      }
      let rows = db.providerRows.filter((r) => u && r.user_id === u.id);
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      if (id) rows = db.providerRows.filter((r) => r.id === id);
      // .single() asks for one object, not a list (like PostgREST does)
      if ((req.headers()["accept"] || "").includes("vnd.pgrst.object")) return rows[0] ? json(route, 200, rows[0]) : json(route, 406, { message: "JSON object requested, multiple (or no) rows returned" });
      return json(route, 200, rows);
    }
    if (p === "/rest/v1/bookings") {
      const u = userFromAuth(req);
      const q = url.searchParams;
      if (m === "HEAD") return route.fulfill({ status: 200, headers: { ...CORS, "content-range": `*/${db.bookings}` }, body: "" });
      if (m === "POST") {
        if (!u || !db.verified.has(u.id)) return json(route, 403, { code: "42501", message: 'new row violates row-level security policy for table "bookings"' });
        const b = body();
        const amount = Number(b.provider_amount);
        // "pdf" = the proposed trigger (price shown = price paid, no fee); "legacy12" = today's live 12% trigger.
        const fee = db.pricingMode === "legacy12" ? Math.round(amount * 0.12) : 0;
        const row = { ...b, id: "b-" + nextId++, provider_amount: amount, platform_fee: fee, total_amount: amount + fee, customer_id: u.id };
        db.storedBookings.push(row);
        const wantsObject = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
        return json(route, 201, wantsObject ? row : [row]);
      }
      if (m === "PATCH") {
        const id = (q.get("id") || "").replace("eq.", "");
        const pid = (q.get("provider_id") || "").replace("eq.", "");
        const row = db.storedBookings.find((r) => r.id === id && (!pid || r.provider_id === pid));
        const patch = body();
        if (row && patch.status === "confirmed" && row.status === "pending" && db.serverWalletRule && !db.launchActive) {
          // mirrors enforce_wallet_before_accept in proposal 20261114: no dues, the fee must be held from the spendable balance
          const fee = fee3(Number(row.provider_amount) - Number(row.parts_amount || 0));
          if (db.wallet.dues > 0) {
            return json(route, 400, { code: "P0001", message: `Recharge ₹${packFor(fee + db.wallet.dues)} to clear ₹${db.wallet.dues} you owe and accept new jobs.` });
          }
          if (db.wallet.available < fee) {
            return json(route, 400, { code: "P0001", message: `Recharge ₹${packFor(fee - db.wallet.available)} to accept. Your wallet is below the ₹${fee} fee.` });
          }
          if (fee > 0) { db.wallet.available -= fee; db.wallet.held += fee; db.holds[row.id] = fee; }
        }
        if (row && patch.status === "cancelled" && db.holds[row.id]) {
          // release_wallet_hold: cancel/decline gives the held fee back
          db.wallet.available += db.holds[row.id]; db.wallet.held -= db.holds[row.id]; delete db.holds[row.id];
        }
        if (row) { db.patches = (db.patches || []).concat([{ id, patch }]); Object.assign(row, patch); }
        return route.fulfill({ status: 204, headers: CORS });
      }
      const id = (q.get("id") || "").replace("eq.", "");
      const pid = (q.get("provider_id") || "").replace("eq.", "");
      const cid = (q.get("customer_id") || "").replace("eq.", "");
      const st = (q.get("status") || "").replace("eq.", "");
      const rows = db.storedBookings
        .filter((r) => (!id || r.id === id) && (!pid || r.provider_id === pid) && (!cid || r.customer_id === cid) && (!st || r.status === st))
        .map((r) => ({ ...r, services: { name: (db.services.find((x) => x.id === r.service_id) || {}).name || null } }));
      return json(route, 200, rows);
    }
    if (p === "/rest/v1/services") {
      const q = url.searchParams;
      const slug = (q.get("slug") || "").replace("eq.", "");
      const id = (q.get("id") || "").replace("eq.", "");
      return json(route, 200, db.services.filter((s) => (!slug || s.slug === slug) && (!id || s.id === id)));
    }
    if (p === "/rest/v1/service_sub_items") {
      const sid = (url.searchParams.get("service_id") || "").replace("eq.", "");
      return json(route, 200, db.subItems.filter((s) => !sid || s.service_id === sid));
    }
    if (p === "/rest/v1/public_providers") {
      const raw = url.searchParams.get("id") || "";
      const ids = raw.startsWith("in.") ? raw.slice(4, -1).split(",") : raw.startsWith("eq.") ? [raw.slice(3)] : null;
      return json(route, 200, db.publicProviders().filter((r) => !ids || ids.includes(r.id)));
    }
    if (p === "/rest/v1/booking_completion_codes") {
      const bid = (url.searchParams.get("booking_id") || "").replace("eq.", "");
      const row = db.storedBookings.find((r) => r.id === bid);
      return json(route, 200, row && ["arrived", "in_progress", "confirmed", "on_the_way"].includes(row.status) ? [{ code: db.completionCode }] : []);
    }
    if (p === "/rest/v1/rpc/get_booking_provider") {
      // Current contact function: returns the pro's phone only while the booking is confirmed or underway.
      if (db.phoneRpcMissing) return json(route, 404, { code: "PGRST202", message: "Could not find the function public.get_booking_provider" });
      const b = body();
      const u = userFromAuth(req);
      const row = db.storedBookings.find((r) => r.id === b.p_booking_id);
      const ok = row && u && row.customer_id === u.id && ["confirmed", "on_the_way", "arrived", "in_progress"].includes(row.status);
      return json(route, 200, ok ? { phone: "9876500099", full_name: "Asha" } : null);
    }
    if (p === "/rest/v1/rpc/get_booking_provider_phone") {
      if (db.phoneRpcMissing) return json(route, 404, { code: "PGRST202", message: "Could not find the function public.get_booking_provider_phone" });
      const b = body();
      const u = userFromAuth(req);
      const row = db.storedBookings.find((r) => r.id === b.p_booking_id);
      const ok = row && u && row.customer_id === u.id && ["confirmed", "on_the_way", "arrived", "in_progress"].includes(row.status);
      return json(route, 200, ok ? "9876500099" : null);
    }
    if (p === "/rest/v1/provider_sub_items") {
      const q = url.searchParams;
      const sid = (q.get("service_id") || "").replace("eq.", "");
      const pid = (q.get("provider_id") || "").replace("eq.", "");
      if (db.subItemsTableMissing) return json(route, 404, { code: "PGRST205", message: "Could not find the table 'public.provider_sub_items'" });
      if (m === "POST") {
        // mirrors check_provider_sub_item: fills service_id, own rate must sit inside the job's band
        for (const r of [].concat(body())) {
          const job = db.subItems.find((s) => s.id === r.sub_item_id);
          if (r.custom_price != null && !(job && job.price_min && r.custom_price >= job.price_min && r.custom_price <= job.price_max)) {
            return json(route, 400, { code: "22023", message: "Set a price between ₹249 and ₹449." });
          }
          db.providerSubItems = db.providerSubItems.filter((x) => !(x.provider_id === r.provider_id && x.sub_item_id === r.sub_item_id));
          db.providerSubItems.push({ ...r, service_id: job.service_id });
        }
        return route.fulfill({ status: 201, headers: CORS });
      }
      if (m === "DELETE") {
        const keep = (q.get("sub_item_id") || "").match(/^not\.in\.\((.*)\)$/);
        const kept = keep ? keep[1].split(",") : [];
        db.providerSubItems = db.providerSubItems.filter((r) => r.provider_id !== pid || kept.includes(r.sub_item_id));
        return route.fulfill({ status: 204, headers: CORS });
      }
      return json(route, 200, db.providerSubItems.filter((r) => (!sid || r.service_id === sid) && (!pid || r.provider_id === pid)));
    }
    if (p === "/rest/v1/provider_services") {
      const sid = (url.searchParams.get("service_id") || "").replace("eq.", "");
      return json(route, 200, db.providerServices.filter((r) => !sid || r.service_id === sid));
    }
    if (p === "/rest/v1/profiles") {
      const u = userFromAuth(req);
      if (m === "GET") return json(route, 200, db.profiles.filter((r) => u && r.user_id === u.id));
      if (m === "PATCH") { const rows = db.profiles.filter((r) => r.user_id === u.id); rows.forEach((r) => Object.assign(r, body())); return json(route, 200, rows.map((r) => ({ user_id: r.user_id }))); }
      if (m === "POST") { db.profiles.push(body()); return route.fulfill({ status: 201, headers: CORS }); }
    }
    if (p === "/rest/v1/rpc/is_customer_email_verified") { const u = userFromAuth(req); return json(route, 200, !!(u && db.verified.has(u.id))); }
    if (p === "/functions/v1/send-customer-otp") return json(route, 200, { success: true, email_hint: "a***@example.com" });
    if (p === "/functions/v1/verify-customer-otp") {
      const u = userFromAuth(req);
      if (body().otp_code !== "123456") return json(route, 400, { error: "Invalid code", attempts_left: 4 });
      db.verified.add(u.id);
      return json(route, 200, { success: true });
    }
    if (p === "/functions/v1/send-welcome-email") return json(route, 200, { ok: true });
    if (p === "/rest/v1/rpc/get_wallet_summary") {
      const { available, dues, held } = db.wallet;
      return json(route, 200, { ok: true, provider_id: "x", balance: available + held - dues, available, held, dues, blocked: false });
    }
    if (p === "/rest/v1/wallet_transactions") return json(route, 200, db.ledger);
    if (p === "/rest/v1/payout_requests") return json(route, 200, db.payouts);
    if (p === "/rest/v1/wallet_settings") return json(route, 200, { min_payout: db.minPayout });
    if (p === "/functions/v1/create-wallet-topup-order") {
      const b = body();
      db.calls.push({ fn: "create-wallet-topup-order", body: b });
      if (![49, 99, 199].includes(b.pack)) return json(route, 400, { error: "Pick a recharge pack: ₹49, ₹99, ₹199." });
      return json(route, 200, { order_id: "order_test1", amount_paise: b.pack * 100, key_id: "rzp_test_x", prefill: {} });
    }
    if (p === "/rest/v1/rpc/request_payout") {
      const b = body();
      const amt = Number(b.p_amount);
      if (!db.payoutDetails) return json(route, 200, { ok: false, reason: "no_payout_details" });
      if (amt < db.minPayout) return json(route, 200, { ok: false, reason: "below_minimum", min_payout: db.minPayout });
      if (amt > db.wallet.available) return json(route, 200, { ok: false, reason: "insufficient_balance" });
      db.wallet.available -= amt;
      const row = { id: "po" + (db.payouts.length + 1), amount: amt, status: "pending", requested_at: new Date().toISOString() };
      db.payouts.unshift(row);
      db.ledger.unshift({ id: "l-po" + db.payouts.length, type: "payout", amount: -amt, note: "Withdrawal request", created_at: row.requested_at });
      return json(route, 200, { ok: true, payout_id: row.id, amount: amt });
    }
    if (p === "/rest/v1/rpc/complete_booking_with_code") {
      const b = body();
      const row = db.storedBookings.find((r) => r.id === b.p_booking_id);
      if (!row || row.status !== "in_progress") return json(route, 200, { ok: false, reason: "invalid_status", status: row && row.status });
      row.failed_attempts = row.failed_attempts || 0;
      if (row.locked_until && new Date(row.locked_until) > new Date()) return json(route, 200, { ok: false, reason: "locked", locked_until: row.locked_until });
      if (b.p_code !== db.completionCode) {
        row.failed_attempts += 1;
        const locked = row.failed_attempts >= 5;
        if (locked) row.locked_until = new Date(Date.now() + 15 * 60000).toISOString();
        return json(route, 200, { ok: false, reason: "wrong_code", attempts_left: Math.max(0, 5 - row.failed_attempts), locked, locked_until: locked ? row.locked_until : null });
      }
      row.status = "completed"; row.completed_at = new Date().toISOString();
      // settle_booking_fee in proposal 20261114: final fee from the hold first, then the spendable balance; never a due with a hold
      const fee = fee3(Number(row.provider_amount) - Number(row.parts_amount || 0));
      const hold = db.holds[row.id] || 0;
      let charged = 0;
      if (!db.launchActive && fee > 0) {
        if (hold > 0) {
          const fromHold = Math.min(fee, hold);
          const fromBal = Math.min(fee - fromHold, db.wallet.available);
          charged = fromHold + fromBal;
          db.wallet.available += hold - fromHold - fromBal;
        } else {
          charged = fee;
          db.wallet.available -= fee;
          if (db.wallet.available < 0) { db.wallet.dues += -db.wallet.available; db.wallet.available = 0; }
        }
      } else {
        db.wallet.available += hold;
      }
      db.wallet.held -= hold; delete db.holds[row.id];
      db.completedFees = (db.completedFees || []).concat([{ id: row.id, fee, charged, waived: db.launchActive }]);
      return json(route, 200, { ok: true });
    }
    if (p === "/rest/v1/provider_locations" && m === "GET") {
      const bid = (url.searchParams.get("booking_id") || "").replace("eq.", "");
      return json(route, 200, db.locations.filter((l) => l.booking_id === bid));
    }
    if (p === "/rest/v1/provider_locations") {
      const b = body();
      db.locations = db.locations.filter((l) => l.booking_id !== b.booking_id).concat([b]);
      return route.fulfill({ status: 201, headers: CORS });
    }
    // Tables added by later slices (working hours, reviews, chat, notifications, identity check): small in-memory tables.
    const simple = ["provider_availability", "reviews", "messages", "customer_notifications", "provider_notifications", "provider_kyc"];
    const name = simple.find((t) => p === "/rest/v1/" + t);
    if (name) {
      const rows = (db.tables[name] ??= []);
      const eq = (list) => {
        let out = list;
        for (const [k, v] of url.searchParams) {
          if (typeof v === "string" && v.startsWith("eq.")) out = out.filter((r) => String(r[k]) === v.slice(3));
          if (typeof v === "string" && v.startsWith("neq.")) out = out.filter((r) => String(r[k]) !== v.slice(4));
        }
        return out;
      };
      const wantsRows = (req.headers()["prefer"] || "").includes("return=representation");
      if (m === "HEAD") return route.fulfill({ status: 200, headers: { ...CORS, "content-range": `*/${eq(rows).length}` } });
      if (m === "GET") return json(route, 200, eq(rows));
      if (m === "POST") {
        const b = body();
        const added = (Array.isArray(b) ? b : [b]).map((r) => ({ id: name + "-" + nextId++, created_at: new Date().toISOString(), is_read: false, ...r }));
        // an upsert on a keyed table (provider_kyc) replaces the row instead of adding a second one
        for (const r of added) {
          const i = name === "provider_kyc" ? rows.findIndex((x) => x.provider_id === r.provider_id) : -1;
          if (i >= 0) Object.assign(rows[i], r); else rows.push(r);
        }
        return wantsRows ? json(route, 201, added) : route.fulfill({ status: 201, headers: CORS });
      }
      if (m === "PATCH") { for (const r of eq(rows)) Object.assign(r, body()); return route.fulfill({ status: 204, headers: CORS }); }
      if (m === "DELETE") {
        const gone = new Set(eq(rows).map((r) => r.id));
        db.tables[name] = rows.filter((r) => !gone.has(r.id));
        return route.fulfill({ status: 204, headers: CORS });
      }
    }
    return json(route, 404, { error: "unmocked " + p });
  });
}


// Minimal Supabase Realtime (Phoenix) server speaking protocol 2.0.0 (realtime-js >= 2.x):
// every frame is the JSON array [join_ref, ref, topic, event, payload]. Joins succeed, heartbeats are
// answered, and tests can push row changes.
async function installRealtime(page) {
  await page.routeWebSocket(/mock\.supabase\.co\/realtime\/v1\/websocket/, (ws) => {
    const sub = { ws, topics: new Map() };
    db.sockets.push(sub);
    ws.onMessage((raw) => {
      let frame; try { frame = JSON.parse(String(raw)); } catch { return; }
      if (!Array.isArray(frame)) return;
      const [joinRef, ref, topic, event, payload] = frame;
      const reply = (response) => ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
      if (event === "phx_join") {
        const changes = (((payload || {}).config || {}).postgres_changes || []).map((c, i) => ({ id: 1000 + i, ...c }));
        sub.topics.set(topic, changes);
        reply({ postgres_changes: changes });
      } else if (event === "phx_leave") { sub.topics.delete(topic); reply({}); }
      else reply({});
    });
  });
}

/** Pushes a row change for `table` to every joined channel that listens to that table. */
function pushChange(table, record, type = "INSERT") {
  for (const { ws, topics } of db.sockets) {
    for (const [topic, changes] of topics) {
      const ids = changes.filter((c) => c.table === table).map((c) => c.id);
      if (ids.length === 0) continue;
      ws.send(JSON.stringify([null, null, topic, "postgres_changes", {
        ids, data: { schema: "public", table, commit_timestamp: new Date().toISOString(), type, columns: [], record, old_record: {}, errors: null },
      }]));
    }
  }
}
const pushBookingChange = (record, type = "INSERT") => pushChange("bookings", record, type);

module.exports = { installMock, installRealtime, pushBookingChange, pushChange, db, jwt, BASE };
