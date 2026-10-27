// Fake Supabase HTTP API used by the web e2e tests (auth.v1, rest.v1, functions.v1).
// Everything lives in memory, so each test run starts clean.
const BASE = process.env.E2E_BASE_URL || "http://localhost:8099";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub, email) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, email, role: "authenticated", aud: "authenticated", exp: 4102444800 })}.sig`;

// ── fake backend state ───────────────────────────────────────────────────────
const db = { users: {}, providerRows: [], profiles: [], bookings: 0, verified: new Set(), calls: [], storedBookings: [], pricingMode: "pdf" };
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
        const row = db.storedBookings.find((r) => r.id === id);
        if (row) Object.assign(row, body());
        return route.fulfill({ status: 204, headers: CORS });
      }
      const id = (q.get("id") || "").replace("eq.", "");
      return json(route, 200, db.storedBookings.filter((r) => !id || r.id === id));
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
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      return json(route, 200, db.publicProviders().filter((r) => !id || r.id === id));
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
    return json(route, 404, { error: "unmocked " + p });
  });
}


module.exports = { installMock, db, jwt, BASE };
