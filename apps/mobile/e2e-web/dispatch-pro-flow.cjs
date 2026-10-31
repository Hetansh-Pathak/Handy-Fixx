// Instant dispatch, Pro side (slice 4): the heartbeat sends a position; an offer arrives as a full-screen alert (no
// countdown) with the job, "about N km away", the area, the earning and the fee, never the address or phone; Accept
// (first wins), Taken by another pro, Expired, customer cancelled, Top up; "Later" keeps it in Jobs -> New -> Requests.
// Needs the dev server started with EXPO_PUBLIC_INSTANT_DISPATCH=1 (README).
const { chromium } = require("playwright");
const path = require("path");
const { installMock, installRealtime, db, BASE } = require("./mock-supabase.cjs");

const OUT = path.join(__dirname, "shots");
require("fs").mkdirSync(OUT, { recursive: true });
const errors = [];
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, colorScheme: "dark",
    geolocation: { latitude: 22.4801, longitude: 70.0612 }, permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_|favicon/.test(m.text())) errors.push("console: " + m.text().slice(0, 200));
  });
  await installMock(page);
  await installRealtime(page);

  const T = (text, exact = true) => page.getByText(text, { exact }).locator("visible=true").last();
  const L = (label) => page.locator(`[aria-label="${label}"]:visible`).last();
  // Case-insensitive: headings styled in capitals come back from innerText in capitals.
  const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ").toLowerCase();
  const has = async (t) => (await body()).includes(t.toLowerCase());
  const see = (text, timeout = 20000) => page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").toLowerCase().includes(t), text.toLowerCase(), { timeout });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png") });

  // ── sign up as an approved pro with ₹100 in the wallet, go online ──────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await see("Welcome back", 60000);
  await T("New here? Create an account").click();
  await L("Full name").fill("Rajesh Kumar");
  await L("Email").fill("rajesh.dispatch@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await T("Create account").click();
  await see("How will you use apnabanda?");
  await T("I'm a pro").click();
  await L("Mobile number").fill("98765 43211");
  await T("Continue").click();
  await see("Verify your identity to start");
  Object.assign(db.providerRows[0], { status: "active", kyc_status: "approved", kyc_reviewed_at: new Date(Date.now() - 200 * 86400000).toISOString(), total_jobs: 40 });
  db.wallet = { available: 100, dues: 0 };
  db.launchActive = false;
  const me = db.providerRows[0].id;
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await see("You're offline");
  await page.locator('[aria-label="Go online"]').first().click({ force: true });
  await see("You're online");
  await page.waitForFunction(() => true);
  for (let i = 0; i < 20 && !(db.presence || []).length; i += 1) await page.waitForTimeout(500);
  const pos = (db.presence || [])[0];
  check("going online sends the heartbeat WITH the position (report_presence)", !!pos && Math.abs(pos.p_lat - 22.4801) < 0.001 && Math.abs(pos.p_lng - 70.0612) < 0.001, JSON.stringify(pos));

  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 8);
  const offer = (id, over = {}, card = {}) => {
    db.storedBookings.push({ id, provider_id: null, service_id: "s-plumb", customer_id: "c-1", status: "pending", dispatch_state: "searching",
      address: "12 MG Road, flat 4", customer_name: "Meera Shah", customer_phone: "9876500001", city: "Jamnagar", pincode: "361008",
      booking_date: today, booking_time: nowTime, provider_amount: 199, total_amount: 199, created_at: new Date().toISOString() });
    const o = { booking_id: id, provider_id: me, status: "offered", ring: 1, distance_km: 1.3, offered_at: new Date().toISOString(),
      card: { service_name: "Plumbing", sub_item_name: "Tap repair", locality: "Jamnagar, 361008", booking_date: today, booking_time: nowTime,
        note: "Kitchen tap drips", price: 199, fee: 15, launch_active: false, wallet_balance: 100, ...card }, ...over };
    (db.offers ??= []).push(o);
    return o;
  };

  // ── 1. an offer arrives as a full-screen alert ──────────────────────────────────────────────────────────────────
  const o1 = offer("b-o1");
  await see("New job near you");
  await see("Tap repair");
  const text = await body();
  check("the alert shows the job, 'about 1.5 km away', the area, Now, the note, the earning and the fee",
    ["about 1.5 km away · jamnagar, 361008", "now", "kitchen tap drips", "you earn", "₹199", "apnabanda fee", "₹15"].every((t) => text.includes(t)), text.slice(0, 400));
  check("never the customer's address, name or phone before accepting", !/mg road|flat 4|meera|98765 ?00001/.test(text));
  check("no countdown: one Accept button, and 'Later'", (await page.getByText("Accept", { exact: true }).locator("visible=true").count()) >= 1 && (await has("No timer")) && !/\b\d+ ?s left\b/.test(text));
  await shot("90-pro-offer-dark");

  // ── 2. Later keeps it in Jobs -> New -> Requests ────────────────────────────────────────────────────────────────
  await T("Later").click();
  await page.goto(`${BASE}/provider/jobs?tab=new`, { waitUntil: "domcontentloaded" });
  await see("Requests");
  check("'Later' keeps the offer in Jobs -> New as a request", (await has("New job near you")) && (await has("about 1.5 km away")));
  await T("New job near you").click();
  await see("Tap repair");
  check("tapping it opens the full-screen offer again", await has("You earn"));

  // ── 3. accept: first wins, straight to the job ──────────────────────────────────────────────────────────────────
  await T("Accept").click();
  await page.waitForURL(/\/provider\/job\/b-o1/, { timeout: 15000 });
  check("Accept wins the job and opens it (the server set the pro and 'confirmed')", o1.status === "accepted" && db.storedBookings.find((b) => b.id === "b-o1").provider_id === me
    && db.calls.some((c) => c.fn === "accept_dispatch_offer" && c.body.p_booking_id === "b-o1"));

  // ── 4. another pro was faster ───────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/provider`, { waitUntil: "domcontentloaded" });
  const o2 = offer("b-o2");
  db.offers.push({ ...o2, provider_id: "someone-else", status: "accepted" }); // another pro won a moment earlier
  await see("New job near you");
  await see("Tap repair");
  await T("Accept").click();
  await see("Taken by another pro");
  check("a pro who taps Accept after another pro won sees 'Taken by another pro'", o2.status === "offered" && db.storedBookings.find((b) => b.id === "b-o2").provider_id === null);
  await shot("91-pro-taken-dark");
  await T("OK").click();

  // ── 5. the offer closes while the alert is open: taken, expired, cancelled ─────────────────────────────────────
  const o3 = offer("b-o3");
  await see("Tap repair");
  await page.waitForTimeout(500);
  o3.status = "expired";
  await see("Expired", 10000);
  check("the search ended while the alert was open: it changes to 'Expired' by itself (no tap needed)", true);
  await T("OK").click();
  const o4 = offer("b-o4");
  await see("Tap repair");
  o4.status = "withdrawn";
  await see("The customer cancelled this request", 10000);
  check("the customer cancelled: the alert says so", true);
  await T("OK").click();

  // ── 6. low wallet ───────────────────────────────────────────────────────────────────────────────────────────────
  offer("b-o5", {}, { wallet_balance: 3 });
  await see("Top up ₹49 to accept");
  check("a low wallet still sees the offer, with 'Top up ₹49 to accept' instead of Accept", (await page.getByText("Accept", { exact: true }).locator("visible=true").count()) === 0);
  await shot("92-pro-topup-dark");
  await T("Top up ₹49 to accept").click();
  await page.waitForURL(/\/provider\/wallet/, { timeout: 15000 });
  check("Top up opens the wallet", true);

  // ── 7. launch period: fee waived, accept with an empty wallet ───────────────────────────────────────────────────
  const o6 = offer("b-o6", {}, { wallet_balance: 0, launch_active: true });
  await see("₹15 waived");
  await T("Accept").click();
  await page.waitForURL(/\/provider\/job\/b-o6/, { timeout: 15000 });
  check("in the launch period the fee shows as waived and Accept works with ₹0", o6.status === "accepted");

  // ── 8. light theme ──────────────────────────────────────────────────────────────────────────────────────────────
  await page.emulateMedia({ colorScheme: "light" });
  offer("b-o7");
  await page.goto(`${BASE}/provider`, { waitUntil: "domcontentloaded" });
  await see("Tap repair");
  await shot("93-pro-offer-light");
  check("light theme: the alert renders", await has("You earn"));

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  console.error("PAGE ERRORS:\n" + errors.slice(0, 6).join("\n---\n"));
  process.exit(2);
});
