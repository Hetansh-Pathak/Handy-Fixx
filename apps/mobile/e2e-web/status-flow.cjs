// Slice 3 end-to-end: the customer's booking list and status screen through a booking's whole life
// (waiting → accepted → on the way with live position → code → done), plus decline/timeout alternatives and cancel.
// See e2e-web/README.md for how to run it.
const { chromium } = require("playwright");
const path = require("path");
const { installMock, installRealtime, pushBookingChange, pushChange, db, BASE } = require("./mock-supabase.cjs");

const OUT = path.join(__dirname, "shots");
require("fs").mkdirSync(OUT, { recursive: true });

const errors = [];
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
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
  const norm = (t) => t.replace(/\s+/g, " ").toLowerCase();
  const has = async (t) => norm(await body()).includes(norm(t));
  const waitBody = (text, timeout = 12000) =>
    page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").toLowerCase().includes(t), norm(text), { timeout });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });

  let seq = 0;
  let userId;
  const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const seed = (over = {}) => {
    const row = {
      id: "b-st" + ++seq, provider_id: "p-asha", service_id: "s-plumb", customer_id: userId, status: "pending",
      created_at: new Date().toISOString(), booking_date: tomorrow(), booking_time: "18:00:00", address: "12 MG Road",
      city: "Gandhinagar", pincode: "382010", special_instructions: "Kitchen tap leaks", sub_item_id: null, sub_item_name: null,
      provider_amount: 349, platform_fee: 0, total_amount: 349, latitude: 23.2156, longitude: 72.6369,
      provider_eta_minutes: null, cancellation_reason: null, ...over,
    };
    db.storedBookings.push(row);
    return row;
  };
  const open = async (row) => { await page.goto(`${BASE}/customer/booking/${row.id}`, { waitUntil: "networkidle" }); };

  // ── sign up as a verified customer ───────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await T("Welcome back", false).waitFor({ state: "visible", timeout: 60000 });
  await T("New here? Create an account").click();
  await L("Full name").fill("Meera Shah");
  await L("Email").fill("meera@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await T("Create account").click();
  await T("How will you use HandyFix?", false).waitFor({ state: "visible" });
  await T("I need a service").click();
  await T("Continue").click();
  await waitBody("What do you need fixed today?");
  userId = db.users["meera@example.com"].id;
  db.verified.add(userId);

  // ── 1. the bookings list ─────────────────────────────────────────────────────
  await T("Bookings", true).click();
  await waitBody("No bookings yet");
  check("an empty bookings tab explains how to start", await has("Pick a service on Home"));
  const b1 = seed();
  await page.goto(`${BASE}/customer/bookings`, { waitUntil: "networkidle" });
  await waitBody("In progress");
  check("a new booking is listed as in progress with its status and price", (await has("Finding your pro")) && (await has("₹349")) && (await has("Asha Patel")));
  await shot("40-bookings-list");
  await page.locator('[aria-label="Booking Plumbing"]:visible').first().click();

  // ── 2. waiting, then accepted over Realtime ──────────────────────────────────
  await waitBody("Waiting for Asha");
  check("while waiting, the customer sees the 30 s countdown", /Asha has \d+ seconds to accept/i.test(await body()));
  await sleep(1000); // realtime channel joins
  b1.status = "confirmed";
  const t0 = Date.now();
  pushBookingChange(b1, "UPDATE");
  await waitBody("Asha accepted", 6000);
  check("acceptance reaches the customer over Realtime (no waiting for the 8 s poll)", Date.now() - t0 < 6000, `${Date.now() - t0} ms`);
  await waitBody("Call Asha", 6000).catch(() => undefined);
  check("after acceptance the pro's number can be called and the contact note changes", (await has("Call Asha")) && (await has("shared only for this booking")));
  check("the code is not shown yet", !(await has("Your code")));
  await shot("41-accepted");

  // ── 3. on the way: ETA, distance, live position, stale position ──────────────
  b1.status = "on_the_way";
  b1.provider_eta_minutes = 12;
  db.locations = [{ booking_id: b1.id, provider_id: "pro-user", latitude: 23.2256, longitude: 72.6369, updated_at: new Date().toISOString() }];
  pushBookingChange(b1, "UPDATE");
  pushChange("provider_locations", db.locations[0], "UPDATE");
  await waitBody("Arriving in about 12 min", 8000);
  await waitBody("km away", 8000).catch(() => undefined);
  const onWay = await body();
  check("on the way: the pro's ETA and distance are shown", /Arriving in about 12 min/.test(onWay) && /\d(\.\d)? km away/.test(onWay));
  check("a live position is not flagged as stale", !(await has("Last seen")));
  check("without the maps key the map card hands off to Google Maps", await has("Open in Google Maps"));
  await shot("42-on-the-way");
  db.locations[0].updated_at = new Date(Date.now() - 5 * 60000).toISOString();
  pushChange("provider_locations", db.locations[0], "UPDATE");
  await waitBody("Last seen 5 min ago", 8000)
    .then(() => check("an old position says 'last seen' instead of pretending to be live", true))
    .catch(async () => check("an old position says 'last seen' instead of pretending to be live", false, (await body()).slice(0, 200)));

  // ── 4. in progress: the code card ────────────────────────────────────────────
  b1.status = "in_progress";
  pushBookingChange(b1, "UPDATE");
  await waitBody("Your code", 8000);
  await page.waitForFunction(() => document.querySelector('[aria-label="Completion code"]')?.textContent?.trim() === "4321", null, { timeout: 8000 }).catch(() => undefined);
  const codeText = await L("Completion code").innerText();
  check("once the job starts the customer sees the 4-digit code with a warning to share it only when happy", codeText.trim() === "4321" && (await has("only when the work is done and you are happy")));
  check("the live map is gone once the pro is working", !(await has("Open in Google Maps")));
  await shot("43-code");

  // ── 5. done ──────────────────────────────────────────────────────────────────
  b1.status = "completed";
  pushBookingChange(b1, "UPDATE");
  await waitBody("All done. Pay Asha ₹349 directly by UPI or cash", 8000);
  check("when completed: pay the pro directly, and no cancel button", !(await has("Cancel booking")) && !(await has("Your code")));
  await shot("44-done");

  // ── 6. the pro did not answer: next best pros, one tap to rebook ─────────────
  const b2 = seed({ created_at: new Date(Date.now() - 60000).toISOString() });
  await open(b2);
  await waitBody("Asha did not answer");
  await waitBody("Next best pros for the same time");
  await waitBody("Ravi Shah");
  const alt = await body();
  check("after 30 s of silence the customer is offered other pros: online, same area, similar price",
    alt.includes("Ravi Shah") && !alt.includes("Surat Suresh") && !alt.includes("Offline Oli") && !alt.includes("Stale Sam"));
  check("the pro who did not answer is not offered again", (alt.match(/Asha Patel/g) || []).length <= 1); // appears once in the details card
  check("alternatives show their own price", alt.includes("₹279"));
  await shot("45-alternatives");
  const before = db.storedBookings.length;
  await T("Book Ravi").click();
  await waitBody("Waiting for Ravi", 8000);
  const rebooked = db.storedBookings[db.storedBookings.length - 1];
  check("choosing another pro books the same job (same slot, address, notes) at that pro's price",
    db.storedBookings.length === before + 1 && rebooked.provider_id === "p-ravi" && rebooked.booking_time === "18:00:00" && rebooked.address === "12 MG Road" &&
    rebooked.special_instructions === "Kitchen tap leaks" && rebooked.provider_amount === 279 && rebooked.platform_fee === 0 && rebooked.status === "pending");
  check("the unanswered request is cancelled", db.storedBookings.find((r) => r.id === b2.id).status === "cancelled");

  // ── 7. declined ──────────────────────────────────────────────────────────────
  const b3 = seed({ status: "cancelled", cancellation_reason: "Declined by provider" });
  await open(b3);
  await waitBody("Asha is unavailable");
  await waitBody("Ravi Shah");
  check("a declined request shows the same alternatives", await has("Next best pros for the same time"));

  // ── 8. cancel while waiting ──────────────────────────────────────────────────
  const b4 = seed();
  await open(b4);
  await waitBody("Waiting for Asha");
  await T("Cancel booking").click();
  await T("Yes, cancel it").click();
  await waitBody("Cancelled", 8000);
  check("the customer can cancel a pending booking", db.storedBookings.find((r) => r.id === b4.id).status === "cancelled");
  check("a cancelled booking offers no cancel button", !(await has("Cancel booking")));

  // ── 9. the contact function is not deployed yet ──────────────────────────────
  db.phoneRpcMissing = true;
  const b5 = seed({ status: "confirmed" });
  await open(b5);
  await waitBody("Asha accepted");
  await sleep(600);
  check("without the contact function the Call button is hidden and nothing breaks", !(await has("Call Asha")) && (await has("Calling and chat open once your pro is confirmed")));
  db.phoneRpcMissing = false;

  // ── 10. a price that differs from what was shown ─────────────────────────────
  const b6 = seed({ status: "confirmed", platform_fee: 42, total_amount: 391 });
  await open(b6);
  await waitBody("The saved price is different");
  check("a saved price that differs from the shown one is flagged here too", (await has("saved at ₹391")) && (await has("₹42 fee")));

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR", String(e).slice(0, 300));
  console.error("PAGE ERRORS:\n" + errors.slice(0, 6).join("\n---\n"));
  process.exit(2);
});
