// Drives the real app (React Native Web in Chromium) against a mocked Supabase HTTP API.
// Covers sign-up/in validation, role-pick, route guards, profile save, email OTP, one-role-per-account,
// forgot/reset password. See e2e-web/README.md for how to run it.
const BASE = process.env.E2E_BASE_URL || "http://localhost:8099";
const { chromium } = require("playwright");
const path = require("path");
const OUT = path.join(__dirname, "shots");
require("fs").mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub, email) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, email, role: "authenticated", aud: "authenticated", exp: 4102444800 })}.sig`;

// ── fake backend state ───────────────────────────────────────────────────────
const db = { users: {}, providerRows: [], profiles: [], bookings: 0, verified: new Set(), calls: [] };
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
    if (p === "/rest/v1/bookings") return route.fulfill({ status: 200, headers: { ...CORS, "content-range": `*/${db.bookings}` }, body: "" });
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

const results = [];
let L;
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|favicon/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
  await installMock(page);
  L = (n) => page.locator(`[aria-label="${n}"]:visible`).last();
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png") });
  const text = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Welcome back", { timeout: 60000 });
  check("signed-out user lands on Sign in", page.url().endsWith("/sign-in") || (await text()).includes("Welcome back"));
  await shot("01-sign-in");

  // sign-in validation
  await page.getByText("Sign in", { exact: true }).locator("visible=true").last().click();
  check("empty sign-in shows field errors", (await text()).includes("Enter a valid email") || (await text()).includes("Invalid email"), "");
  await shot("02-sign-in-errors");

  // wrong credentials -> friendly message from mocked backend
  await L("Email").fill("nobody@example.com");
  await L("Password").fill("wrongpass1");
  await page.getByText("Sign in", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Wrong email or password.", { timeout: 15000 }).then(() => check("wrong password shows friendly error", true)).catch(() => check("wrong password shows friendly error", false));

  // sign-up validation then success
  await page.getByText("New here? Create an account").last().click();
  await page.waitForSelector("text=Create your account");
  await L("Full name").fill("Asha Patel");
  await L("Email").fill("asha@example.com");
  await L("Password").fill("weakpass");
  await L("Confirm password").fill("different1");
  await page.getByText("Create account", { exact: true }).locator("visible=true").last().click();
  let t = await text();
  check("sign-up flags weak password and mismatch", t.includes("Include at least one number") && t.includes("Passwords do not match"));
  await shot("03-sign-up-errors");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await page.getByText("Create account", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=How will you use HandyFix?", { timeout: 20000 }).then(() => check("sign-up lands on role-pick (guard)", true)).catch(async () => check("sign-up lands on role-pick (guard)", false, (await text()).slice(0, 200)));
  await shot("04-role-pick");

  // role pick: provider w/o phone should block; then customer
  await page.getByText("I'm a pro").last().click();
  await page.getByText("Continue", { exact: true }).locator("visible=true").last().click();
  check("pro pick requires a valid mobile", (await text()).includes("Enter a valid 10-digit mobile number"));
  await shot("05-role-pick-pro-error");
  await page.getByText("I need a service").last().click();
  await page.getByText("Continue", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=What do you need fixed today?", { timeout: 20000 }).then(() => check("customer pick lands on customer home", true)).catch(async () => check("customer pick lands on customer home", false, (await text()).slice(0, 200)));
  check("home greets by first name", (await text()).includes("Hi, Asha"));
  await shot("06-customer-home");

  // profile + save + verification
  await page.getByText("Profile", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Verify your email");
  await shot("07-customer-profile");
  await L("Mobile number").fill("12345");
  await L("Pincode").fill("12");
  await page.getByText("Save changes").last().click();
  t = await text();
  check("profile validates phone and pincode", t.includes("Enter a valid 10-digit mobile number") && t.includes("Enter a valid 6-digit pincode"));
  await L("Mobile number").fill("+91 98765 43210");
  await L("Address").fill("12 MG Road");
  await L("City").fill("Gandhinagar");
  await L("Pincode").fill("382010");
  await page.getByText("Save changes").last().click();
  await page.waitForSelector("text=Profile saved.").then(() => check("profile saves (update→insert fallback)", true)).catch(() => check("profile saves (update→insert fallback)", false));
  check("saved profile has normalised phone", db.profiles[0]?.phone === "9876543210" && db.profiles[0]?.pincode === "382010", JSON.stringify(db.profiles[0] || {}));

  await page.getByText("Send code", { exact: true }).click();
  await page.waitForSelector("text=We sent a 6-digit code");
  await L("6-digit code").fill("000000");
  await page.getByText("Verify", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Invalid code", { timeout: 10000 }).then(() => check("wrong OTP shows server error", true)).catch(() => check("wrong OTP shows server error", false));
  await L("6-digit code").fill("123456");
  await page.getByText("Verify", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Email verified", { timeout: 10000 }).then(() => check("correct OTP marks email verified", true)).catch(() => check("correct OTP marks email verified", false));
  await shot("08-profile-verified");

  // reload: session persists, goes straight to customer home
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=What do you need fixed today?", { timeout: 30000 }).then(() => check("session persists across reload", true)).catch(async () => check("session persists across reload", false, (await text()).slice(0, 160)));

  // sign out -> sign in screen
  await page.getByText("Profile", { exact: true }).locator("visible=true").last().click();
  await page.getByText("Sign out", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Welcome back", { timeout: 15000 }).then(() => check("sign out returns to sign in", true)).catch(() => check("sign out returns to sign in", false));

  // provider path with a fresh account
  await page.getByText("New here? Create an account").last().click();
  await L("Full name").fill("Rajesh Kumar");
  await L("Email").fill("rajesh@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await page.getByText("Create account", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=How will you use HandyFix?");
  await page.getByText("I'm a pro").last().click();
  await L("Mobile number").fill("98765 43211");
  await page.getByText("Continue", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Verify your identity to start", { timeout: 20000 }).then(() => check("pro pick creates provider row and lands on provider home", true)).catch(async () => check("pro pick creates provider row and lands on provider home", false, (await text()).slice(0, 200)));
  const row = db.providerRows[0];
  check("provider row is pending_approval / not_submitted with normalised phone", row?.status === "pending_approval" && row?.kyc_status === "not_submitted" && row?.phone === "9876543211", JSON.stringify(row || {}));
  await shot("09-provider-home");
  await page.getByText("Profile", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Identity check");
  await shot("10-provider-profile");

  // one role per account: customer with bookings cannot become a pro
  await page.getByText("Sign out", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Welcome back");
  await page.getByText("New here? Create an account").last().click();
  await L("Full name").fill("Meera Shah");
  await L("Email").fill("meera@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  db.bookings = 2;
  await page.getByText("Create account", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=How will you use HandyFix?");
  await page.getByText("I'm a pro").last().click();
  await L("Mobile number").fill("9876543212");
  await page.getByText("Continue", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=sign up with a different email").then(() => check("account with bookings cannot become a pro", true)).catch(() => check("account with bookings cannot become a pro", false));
  check("no provider row was created for that account", db.providerRows.length === 1);
  await shot("11-pro-blocked");

  // forgot password
  await page.getByText("Sign out", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Welcome back");
  await page.getByText("Forgot password?").last().click();
  await page.waitForSelector("text=Reset your password", { timeout: 10000 }).catch(async () => { console.log("DEBUG url:", page.url(), "body:", (await text()).slice(0, 200)); await shot("debug-forgot"); });
  await page.waitForTimeout(600);
  await L("Email").fill("asha@example.com");
  await page.getByText("Send reset link").last().click();
  await page.waitForSelector("text=reset link is on its way").then(() => check("forgot password confirms (no account enumeration)", true)).catch(() => check("forgot password confirms (no account enumeration)", false));
  await shot("12-forgot");

  // reset link: invalid and valid
  await page.goto(`${BASE}/reset-password#error=access_denied&error_description=Email+link+is+invalid+or+has+expired`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=expired").then(() => check("expired reset link is explained", true)).catch(() => check("expired reset link is explained", false, ""));
  const u = db.users["asha@example.com"];
  await page.goto("about:blank");
  await page.goto(`${BASE}/reset-password#access_token=${jwt(u.id, u.email)}&refresh_token=r-${u.id}&expires_in=3600&type=recovery`, { waitUntil: "networkidle" });
  await page.waitForSelector('[aria-label="New password"]', { state: "visible", timeout: 15000 }).then(() => check("valid recovery link opens the new-password form", true)).catch(async () => check("valid recovery link opens the new-password form", false, (await text()).slice(0, 200)));
  await L("New password").fill("brandnew99");
  await L("Confirm new password").fill("brandnew99");
  await page.getByText("Update password").last().click();
  await page.waitForSelector("text=Password updated").then(() => check("new password is saved", true)).catch(() => check("new password is saved", false));
  check("backend received the new password", db.users["asha@example.com"].password === "brandnew99");
  await shot("13-reset-done");

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
