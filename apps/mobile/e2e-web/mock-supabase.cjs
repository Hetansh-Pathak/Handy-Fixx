// Fake Supabase HTTP API used by the web e2e tests (auth.v1, rest.v1, functions.v1).
// Everything lives in memory, so each test run starts clean.
const BASE = process.env.E2E_BASE_URL || "http://localhost:8099";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub, email) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, email, role: "authenticated", aud: "authenticated", exp: 4102444800 })}.sig`;

// ── fake backend state ───────────────────────────────────────────────────────
const db = { users: {}, providerRows: [], profiles: [], bookings: 0, verified: new Set(), calls: [], storedBookings: [], pricingMode: "pdf", locations: [], wallet: { available: 0, dues: 0 }, launchActive: true, serverWalletRule: true, sockets: [], completionCode: "4321" };
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
  { id: "si-leak", service_id: "s-plumb", name: "Pipe leak", description: "Leak in a pipe or joint", icon: "💧", base_price: 349, duration_minutes: 60 },
];
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
      const rows = db.providerRows.filter((r) => u && r.user_id === u.id);
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
          // mirrors the proposed enforce_wallet_before_accept trigger
          const amount = Number(row.provider_amount);
          const fee = amount <= 0 ? 0 : amount < 500 ? 15 : amount <= 1500 ? 30 : 50;
          if (db.wallet.available < fee || db.wallet.dues > 0) {
            return json(route, 400, { code: "P0001", message: "Wallet below the fee. Top up Rs 100 to accept." });
          }
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
      return json(route, 200, db.subItems.filter((s) => s.service_id === sid));
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
    if (p === "/rest/v1/rpc/get_booking_provider_phone") {
      if (db.phoneRpcMissing) return json(route, 404, { code: "PGRST202", message: "Could not find the function public.get_booking_provider_phone" });
      const b = body();
      const u = userFromAuth(req);
      const row = db.storedBookings.find((r) => r.id === b.p_booking_id);
      const ok = row && u && row.customer_id === u.id && ["confirmed", "on_the_way", "arrived", "in_progress"].includes(row.status);
      return json(route, 200, ok ? "9876500099" : null);
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
      const { available, dues } = db.wallet;
      return json(route, 200, { ok: true, provider_id: "x", balance: available - dues, available, dues, blocked: false });
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
      // the proposed settle_booking_fee: flat slab from the wallet, unless the launch period waives it
      const amount = Number(row.provider_amount);
      const fee = amount <= 0 ? 0 : amount < 500 ? 15 : amount <= 1500 ? 30 : 50;
      if (!db.launchActive && fee > 0) { db.wallet.available -= fee; if (db.wallet.available < 0) { db.wallet.dues += -db.wallet.available; db.wallet.available = 0; } }
      db.completedFees = (db.completedFees || []).concat([{ id: row.id, fee, waived: db.launchActive }]);
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
