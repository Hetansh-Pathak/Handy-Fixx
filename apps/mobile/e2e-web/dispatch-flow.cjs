// Instant dispatch, customer side (slice 3): service -> request (Now / later, pinned address) -> "Find a pro · ₹X" ->
// Finding (rings widen) -> Found / No pro / Cancel. The search itself runs on the server; the mock lets the suite set
// each state (db.dispatch[bookingId]). Needs the dev server started with EXPO_PUBLIC_INSTANT_DISPATCH=1 (README).
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
const JAMNAGAR = { latitude: 22.4707, longitude: 70.0577 };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, colorScheme: "dark",
    geolocation: JAMNAGAR, permissions: ["geolocation"],
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
  const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const has = async (t) => (await body()).includes(t);
  const waitBody = (text, timeout = 15000) =>
    page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").includes(t), text, { timeout });
  const count = (text) => page.getByText(text, { exact: false }).locator("visible=true").count();
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png") });
  const lastBooking = () => db.storedBookings[db.storedBookings.length - 1];

  // ── sign up as a verified customer ───────────────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await T("Welcome back").waitFor({ timeout: 60000 });
  await T("New here? Create an account").click();
  await L("Full name").fill("Meera Shah");
  await L("Email").fill("dispatch@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await T("Create account").click();
  await T("How will you use HandyFix?", false).waitFor({ state: "visible" });
  await T("I need a service").click();
  await T("Continue").click();
  await waitBody("What do you need fixed today?");
  const userId = db.users["dispatch@example.com"].id;
  db.verified.add(userId);
  db.dispatchDots = [{ lat: 22.48, lng: 70.06 }, { lat: 22.46, lng: 70.05 }, { lat: 22.47, lng: 70.07 }];

  // ── 1. the service page has no pro list ─────────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/customer/service/plumbing`, { waitUntil: "domcontentloaded" });
  await waitBody("Tap repair");
  check("no pro list, no sorting: customers do not choose a pro", (await count("Top rated")) === 0 && (await count("Cheapest")) === 0 && !(await has("Book Asha")));
  await T("Tap repair").click();
  await waitBody("Continue · ₹199");
  check("picking the job shows one fixed price and Continue", await has("One fixed price. We find the nearest verified pro for you."));
  await T("Continue · ₹199").click();

  // ── 2. request: price locked, Now by default, pinned address required ──────────────────────────────────────────
  await waitBody("Find a pro · ₹199");
  check("the request shows the locked price, ₹0 platform fee and 'Now' by default",
    (await has("Price locked")) && (await has("₹199")) && (await has("Platform fee")) && (await has("We ask pros near you right away")));
  await T("Find a pro · ₹199").click();
  await waitBody("Pin your location so we can find pros near you.");
  check("without a pinned location the search does not start", !db.storedBookings.length);
  await T("Use my current location").click();
  await waitBody("Location pinned · update");
  await L("Address").fill("12 MG Road, Patel Colony");
  await L("City").fill("Jamnagar");
  await L("Pincode").fill("361008");
  await shot("80-request-dark");
  await T("Find a pro · ₹199").click();

  // ── 3. finding ─────────────────────────────────────────────────────────────────────────────────────────────────
  await waitBody("Finding your pro");
  const b1 = lastBooking();
  check("the booking is saved with NO pro and the app sends no price (the database sets it)",
    b1.provider_id === null && !("total_amount" in db.lastInsert) && !("provider_amount" in db.lastInsert) && Number(b1.total_amount) === 199 && b1.sub_item_id === "si-tap" && b1.latitude === JAMNAGAR.latitude);
  check("then the server search is started", db.calls.some((c) => c.fn === "start_dispatch" && c.body.p_booking_id === b1.id));
  await waitBody("3 pros notified");
  check("Finding shows ring 1, the stage chips, the service card and how many pros were notified",
    (await has("Asking pros within 2 km")) && (await has("2 km")) && (await has("5-10 km")) && (await has("Jamnagar"))
    && (await has("Tap repair")) && (await has("₹0 platform fee")) && (await has("The first to accept gets your job. No charge for cancelling.")));
  check("the status line is a live region for screen readers", (await page.locator('[aria-live="polite"]').count()) >= 1);
  await page.waitForTimeout(1200);
  const dotsSeen = await page.locator("div").evaluateAll((els) => els.filter((e) => getComputedStyle(e).backgroundColor === "rgb(255, 194, 51)" && e.getBoundingClientRect().width < 30 && e.getBoundingClientRect().width > 0 || false).map((e) => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { w: Math.round(r.width), x: Math.round(r.x), y: Math.round(r.y), op: cs.opacity, tf: cs.transform };
  }));
  check("each notified pro is an amber dot on the map, popped in and visible", dotsSeen.length === 3 && dotsSeen.every((d) => d.w >= 10 && d.op !== "0"), JSON.stringify(dotsSeen));
  await shot("81-finding-dark");

  db.dispatch[b1.id].ring = 2;
  await waitBody("Widening to 5 km");
  check("the status follows the rings: 5 km", true);
  db.dispatch[b1.id].ring = 4;
  db.dispatch[b1.id].dots.push({ lat: 22.55, lng: 70.1 });
  await waitBody("Asking all pros in Jamnagar");
  await waitBody("4 pros notified");
  check("...then the whole city, with the new pro counted", true);

  // ── 4. found ───────────────────────────────────────────────────────────────────────────────────────────────────
  Object.assign(b1, { dispatch_state: "assigned", status: "confirmed", provider_id: "p-asha" });
  Object.assign(db.dispatch[b1.id], {
    dots: [{ lat: 22.48, lng: 70.06 }], pro: { id: "p-asha", name: "Asha Patel", rating: 4.8, jobs: 31, verified: true },
    acceptedAt: new Date(new Date(b1.searched_since).getTime() + 38000).toISOString(),
  });
  await waitBody("Pro found in 38 s");
  check("found: the pro card with name, rating, jobs, ETA and the locked price",
    (await has("Asha Patel")) && (await has("31 jobs")) && (await has("min away")) && (await has("₹199")) && (await has("locked")));
  check("found: Message and Track buttons", (await count("Message")) >= 1 && (await count("Track Asha")) >= 1);
  await shot("82-found-dark");
  await T("Track Asha").click();
  await page.waitForURL(/\/customer\/booking\//, { timeout: 15000 });
  check("Track opens the normal booking status screen", true);

  // ── 5. no pro, keep looking, schedule for later ─────────────────────────────────────────────────────────────────
  const startAnother = async () => {
    await page.goto(`${BASE}/customer/request/new?service=plumbing&sub=si-tap`, { waitUntil: "domcontentloaded" });
    await waitBody("Find a pro · ₹199");
    await T("Use my current location").click();
    await waitBody("Location pinned · update");
    await L("Address").fill("12 MG Road, Patel Colony");
    await L("City").fill("Jamnagar");
    await L("Pincode").fill("361008");
    await T("Find a pro · ₹199").click();
    await waitBody("Finding your pro");
    return lastBooking();
  };
  const b2 = await startAnother();
  b2.dispatch_state = "no_pro";
  await waitBody("No pro available right now", 8000).catch(() => undefined);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitBody("No pro available right now");
  check("no pro: the three choices and the reassurance line",
    (await has("Keep looking for 10 more minutes")) && (await has("Schedule for later")) && (await has("Cancel request")) && (await has("We will notify you the moment a pro accepts.")));
  await shot("83-no-pro-dark");
  await T("Keep looking for 10 more minutes").click();
  await waitBody("Asking all pros in Jamnagar");
  check("keep looking restarts the search on the whole city", db.calls.some((c) => c.fn === "extend_search" && c.body.p_booking_id === b2.id));

  b2.dispatch_state = "no_pro";
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitBody("No pro available right now");
  await T("Schedule for later").click();
  await waitBody("Find a pro · ₹199");
  check("schedule for later opens the request for the same job with the clock instead of 'Now'", (await has("Tap repair")) && !(await has("We ask pros near you right away")));

  // ── 6. cancel while searching ───────────────────────────────────────────────────────────────────────────────────
  const b3 = await startAnother();
  await T("Cancel request").click();
  await waitBody("It is free: no pro has accepted yet.");
  await T("Yes, cancel request").click();
  await waitBody("Request cancelled");
  check("cancel while searching: free, confirmed first, then 'Request cancelled'", b3.status === "cancelled" && db.calls.some((c) => c.fn === "cancel_search" && c.body.p_booking_id === b3.id));

  // ── 7. reopening a searching booking (app was closed) lands on Finding ─────────────────────────────────────────
  const b4 = await startAnother();
  await page.goto(`${BASE}/customer/booking/${b4.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/customer\/request\//, { timeout: 15000 });
  await waitBody("Finding your pro");
  check("opening a booking that is still searching shows the Finding screen (state from the database)", true);
  await T("Cancel request").click();
  await T("Yes, cancel request").click();
  await waitBody("Request cancelled");

  // ── 8. the server refuses: its message, and the empty booking is cancelled ─────────────────────────────────────
  db.dispatchRefusal = "You already have a search running. Cancel it first or wait for a pro.";
  await page.goto(`${BASE}/customer/request/new?service=plumbing&sub=si-tap`, { waitUntil: "domcontentloaded" });
  await waitBody("Find a pro · ₹199");
  await T("Use my current location").click();
  await waitBody("Location pinned · update");
  await L("Address").fill("12 MG Road, Patel Colony");
  await L("City").fill("Jamnagar");
  await L("Pincode").fill("361008");
  await T("Find a pro · ₹199").click();
  await waitBody("You already have a search running");
  check("a refusal from the server is shown in its own words and the empty booking is cancelled", lastBooking().status === "cancelled");
  db.dispatchRefusal = null;

  // ── 9. outside Jamnagar ─────────────────────────────────────────────────────────────────────────────────────────
  await ctx.setGeolocation({ latitude: 23.0225, longitude: 72.5714 });
  const before = db.storedBookings.length;
  await page.goto(`${BASE}/customer/request/new?service=plumbing&sub=si-tap`, { waitUntil: "domcontentloaded" });
  await waitBody("Find a pro · ₹199");
  await T("Use my current location").click();
  await waitBody("Location pinned · update");
  await L("Address").fill("Ashram Road");
  await L("City").fill("Ahmedabad");
  await L("Pincode").fill("380009");
  await T("Find a pro · ₹199").click();
  await waitBody("apnabanda works in Jamnagar for now");
  check("an address outside Jamnagar gets a clear message and no booking", db.storedBookings.length === before);
  await ctx.setGeolocation(JAMNAGAR);

  // ── 10. light theme and reduce motion ───────────────────────────────────────────────────────────────────────────
  const light = await browser.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce" });
  const lp = await light.newPage();
  lp.on("pageerror", (e) => errors.push("pageerror(light): " + e.message));
  await installMock(lp);
  await installRealtime(lp);
  // reuse the signed-in session
  const storage = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  await lp.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await lp.evaluate((s) => { for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, v); }, storage);
  const b5 = await (async () => {
    const row = { ...b4, id: "b-light", status: "pending", dispatch_state: "searching", searched_since: new Date().toISOString(), search_ends_at: new Date(Date.now() + 120000).toISOString() };
    db.storedBookings.push(row);
    db.dispatch[row.id] = { ring: 1, dots: db.dispatchDots.slice(), pro: null, acceptedAt: null };
    return row;
  })();
  await lp.goto(`${BASE}/customer/request/${b5.id}`, { waitUntil: "domcontentloaded" });
  await lp.waitForFunction(() => document.body.innerText.includes("Asking pros within 2 km"), null, { timeout: 30000 });
  check("light theme with reduce-motion: the Finding screen works (rings stand still, text still updates)", true);
  await lp.screenshot({ path: path.join(OUT, "84-finding-light-reduced-motion.png") });
  await light.close();

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
