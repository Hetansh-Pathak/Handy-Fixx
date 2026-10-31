// Slice 4 end-to-end: approval gate → go online → request alert → accept/decline → job steps → completion code → wallet rules.
// See e2e-web/README.md for how to run it.
const { chromium } = require("playwright");
const path = require("path");
const { installMock, installRealtime, pushBookingChange, db, BASE } = require("./mock-supabase.cjs");

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
  await ctx.grantPermissions(["geolocation"]);
  await ctx.setGeolocation({ latitude: 23.2156, longitude: 72.6369 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_|favicon/.test(m.text())) errors.push("console: " + m.text().slice(0, 200));
  });
  await installMock(page);
  await installRealtime(page);

  const T = (text, exact = true) => page.getByText(text, { exact }).locator("visible=true").last();
  const L = (label) => page.locator(`[aria-label="${label}"]:visible`).last();
  const count = async (text, exact = true) => page.getByText(text, { exact }).locator("visible=true").count();
  const see = (text, timeout = 15000) => T(text, false).waitFor({ state: "visible", timeout });
  const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const norm = (t) => t.replace(/\s+/g, " ").toLowerCase();
  const has = async (text) => norm(await body()).includes(norm(text));
  const waitBody = (text, timeout = 15000) =>
    page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").toLowerCase().includes(t), norm(text), { timeout });
  // A new request shows a popup (no timer) with "View request"; the decision is made on the request screen.
  const alertUp = (timeout = 15000) => T("View request").waitFor({ state: "visible", timeout });
  const openRequest = async () => { await T("View request").click(); await see("Review the problem"); };
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
  const isDisabled = async (locator) => (await locator.getAttribute("aria-disabled")) === "true" || (await locator.isDisabled().catch(() => false));

  let seq = 0;
  const providerId = () => db.providerRows[0].id;
  const newRequest = (over = {}) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const row = {
      id: "b-req" + ++seq, provider_id: providerId(), service_id: "s-plumb", customer_id: "c-1", status: "pending",
      created_at: new Date().toISOString(), booking_date: tomorrow, booking_time: "18:00:00", address: "12 MG Road",
      city: "Gandhinagar", pincode: "382010", customer_name: "Meera Shah", customer_phone: "9876500001",
      provider_amount: 349, total_amount: 349, platform_fee: 0, sub_item_name: null, special_instructions: "Kitchen tap leaks",
      latitude: 23.2, longitude: 72.6, ...over,
    };
    db.storedBookings.push(row);
    return row;
  };
  const approve = (over = {}) => Object.assign(db.providerRows[0], { status: "active", kyc_status: "approved", kyc_reviewed_at: new Date(Date.now() - 10 * 86400000).toISOString(), total_jobs: 2, ...over });
  const goHome = async () => { await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); };

  // ── 1. sign up as a pro; not approved yet ────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await see("Welcome back", 60000);
  await T("New here? Create an account").click();
  await L("Full name").fill("Rajesh Kumar");
  await L("Email").fill("rajesh@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await T("Create account").click();
  await see("How will you use apnabanda?");
  await T("I'm a pro").click();
  await L("Mobile number").fill("98765 43211");
  await T("Continue").click();
  await see("Verify your identity to start");
  const sw = page.locator('[aria-label="Go online"]').first();
  check("an unapproved pro cannot go online", (await isDisabled(sw)) && (await body()).includes("Complete your identity check"));
  await shot("30-provider-unapproved");

  // ── 2. approved: switch enabled, wallet and launch strip ─────────────────────
  approve();
  db.wallet = { available: 0, dues: 0 };
  db.launchActive = true;
  await goHome();
  await see("You're offline");
  check("after approval the switch is enabled and the launch period is shown",
    !(await isDisabled(page.locator('[aria-label="Go online"]').first())) && (await body()).includes("Fee-free launch: 8 jobs") && (await body()).includes("Wallet ₹0"));
  await shot("31-provider-approved");

  // ── 3. go online ─────────────────────────────────────────────────────────────
  await page.locator('[aria-label="Go online"]').first().click({ force: true });
  await see("You're online");
  check("going online updates the server and starts the heartbeat", db.providerRows[0].is_online === true && (db.heartbeats || 0) >= 1, `heartbeats=${db.heartbeats}`);
  await sleep(1200); // let the realtime channel join

  // ── 4. a request arrives through Realtime ────────────────────────────────────
  const r1 = newRequest();
  const t0 = Date.now();
  pushBookingChange(r1, "INSERT");
  await alertUp(6000);
  const dt = Date.now() - t0;
  check("a request arrives by Realtime well before the 8 s polling fallback", dt < 6000, `${dt} ms`);
  const popupText = await body();
  check("the popup shows the request, what the pro earns and the 3% fee (waived in launch), with no timer",
    popupText.includes("Kitchen tap leaks") && popupText.includes("You earn ₹349") && popupText.includes("apnabanda fee ₹10 waived") && popupText.includes("No timer") && !/seconds/i.test(popupText), popupText.slice(0, 260));
  await sleep(700);
  await shot("32-request-popup");
  await openRequest();
  const alertText = await body();
  check("the request screen shows the earning and the fee before deciding (fee waived in launch)",
    alertText.includes("You earn ₹349") && alertText.includes("apnabanda fee ₹10 waived") && alertText.includes("You keep ₹349"), alertText.slice(0, 260));
  check("the customer's phone is not shown before accepting", !alertText.includes("9876500001"));
  await T("Accept").click();
  await see("Ready to start");
  check("accepting confirms the booking and opens the job", db.storedBookings.find((b) => b.id === r1.id).status === "confirmed" && (await has("Step 1 of 3")));
  check("after accepting the customer's phone can be called", (await body()).includes("Call 9876500001"));
  await shot("33-job-confirmed");

  // ── 5. job steps and the completion code ─────────────────────────────────────
  await T("Start trip").click();
  await see("On the way");
  const trip = db.patches.find((p) => p.id === r1.id && p.patch.status === "on_the_way");
  check("start trip records departure and turns tracking on", trip && trip.patch.tracking_active === true && !!trip.patch.provider_departed_at);
  check("without the arrived status the next step is Start job (step 2 of 3)", (await has("Step 2 of 3")) && (await count("Start job")) >= 1);
  await T("Start job").click();
  await see("Enter customer's code");
  check("start job moves to in progress", db.storedBookings.find((b) => b.id === r1.id).status === "in_progress" && (await has("Step 3 of 3")));
  for (let i = 0; i < 24 && !(db.arrivals || []).some((a) => a.booking_id === r1.id); i += 1) await sleep(250);
  check("starting the job records the arrival (time and position) for dispute evidence", (db.arrivals || []).some((a) => a.booking_id === r1.id && typeof a.lat === "number" && typeof a.lng === "number"), JSON.stringify(db.arrivals || []));
  check("a job that just started shows no 'Problem closing the job?' prompt", !(await has("Problem closing the job?")));
  db.storedBookings.find((b) => b.id === r1.id).started_at = new Date(Date.now() - 3 * 3600000).toISOString();
  await waitBody("Problem closing the job?", 20000)
    .then(async () => check("after 2 hours in progress the pro sees 'Problem closing the job?' and is told not to ask for the code early", (await has("Do not ask for the code before the work is finished")) && (await count("Email apnabanda")) >= 1))
    .catch(async () => check("after 2 hours in progress the pro sees 'Problem closing the job?' and is told not to ask for the code early", false, (await body()).slice(0, 300)));
  await L("Customer's code").fill("12");
  await T("Enter customer's code").click();
  check("a short code is rejected before calling the server", (await body()).includes("Enter the 4-digit code"));
  await L("Customer's code").fill("0000");
  await T("Enter customer's code").click();
  await see("Incorrect code. 4 attempts left.");
  check("a wrong code shows the attempts left", true);
  await L("Customer's code").fill("4321");
  await T("Enter customer's code").click();
  await see("Job completed");
  const doneText = await body();
  check("the right code completes the job; the fee is shown as waived and nothing is charged in launch",
    db.storedBookings.find((b) => b.id === r1.id).status === "completed" && doneText.includes("apnabanda fee ₹10 waived") && doneText.includes("You keep ₹349") && db.wallet.available === 0);
  await shot("34-job-completed");
  await T("Done").click();

  // ── 6. decline, picked up by the polling fallback (no realtime push) ─────────
  await see("Jobs");
  await T("Home", true).click();
  await see("You're online");
  const r2 = newRequest();
  const t1 = Date.now();
  await alertUp(14000);
  check("a request is also found by polling if Realtime misses it", Date.now() - t1 < 14000, `${Date.now() - t1} ms`);
  await openRequest();
  await T("Decline").click();
  for (let i = 0; i < 20 && db.storedBookings.find((b) => b.id === r2.id).status !== "cancelled"; i += 1) await sleep(250);
  const declined = db.storedBookings.find((b) => b.id === r2.id);
  check("declining cancels with a reason (customer is offered the next pros)", declined.status === "cancelled" && declined.cancellation_reason === "Declined by provider");

  // ── 7. wallet rules after the launch period ──────────────────────────────────
  db.launchActive = false;
  approve({ kyc_reviewed_at: new Date(Date.now() - 200 * 86400000).toISOString(), total_jobs: 20 });
  db.wallet = { available: 0, dues: 0 };
  await goHome();
  await see("You're online"); // online state survives a restart
  check("online state is restored after the app restarts", (await body()).includes("You're online") && !(await body()).includes("Fee-free launch"));
  await sleep(1200);
  const r3 = newRequest();
  pushBookingChange(r3);
  await alertUp(6000);
  await see("Locked job request", 8000);
  const lockedPopup = await body();
  check("the alert for a request the wallet cannot cover says Locked and offers the recharge",
    norm(lockedPopup).includes("locked job request") && (await count("Recharge ₹49 to accept")) >= 1 && norm(lockedPopup).includes("you earn ₹349"), lockedPopup.slice(0, 300));
  await openRequest();
  const blockedText = await body();
  check("with an empty wallet the request says to recharge the ₹49 pack and Accept is disabled",
    blockedText.includes("Recharge ₹49 to accept. Your wallet is below the ₹10 fee.") && blockedText.includes("apnabanda fee ₹10") && !blockedText.includes("waived"), blockedText.slice(0, 260));
  const acceptBtn = page.locator('[aria-disabled="true"]:visible', { hasText: /^Accept$/ });
  check("Accept is disabled", (await acceptBtn.count()) >= 1);
  check("a Recharge button leads to the wallet", (await count("Recharge ₹49 to accept")) >= 1);
  await sleep(700);
  await shot("35-request-blocked");
  await T("Decline").click();
  for (let i = 0; i < 20 && db.storedBookings.find((b) => b.id === r3.id).status !== "cancelled"; i += 1) await sleep(250);

  check("the locked request page explains the lock and keeps the street address hidden",
    blockedText.includes("Locked: recharge to take this job") && blockedText.includes("full address after you accept") && !blockedText.includes("12 MG Road"), blockedText.slice(0, 300));

  // Jobs > New: locked requests stay visible (earning shown) but at most 3 cards, then a counter.
  const extra = [newRequest(), newRequest(), newRequest(), newRequest(), newRequest()];
  extra.forEach((r) => pushBookingChange(r));
  await page.goto(`${BASE}/provider/jobs?tab=new`, { waitUntil: "networkidle" });
  for (let i = 0; i < 8 && (await count("Later")) > 0; i += 1) { await T("Later").click(); await sleep(250); }
  await see("+2 more locked requests", 20000);
  const lockedList = await body();
  const lockedCards = lockedList.split("You would earn ₹349 · fee ₹10 · you would keep ₹339").length - 1;
  check("Jobs > New shows 3 locked cards with the earning and a +2 more counter", lockedCards === 3 && lockedList.includes("+2 more locked requests"), `${lockedCards} cards`);
  check("a locked card does not show the street address", !lockedList.includes("12 MG Road"));
  await sleep(500);
  await shot("35b-jobs-locked");
  for (const r of extra) db.storedBookings.splice(db.storedBookings.findIndex((b) => b.id === r.id), 1); // keep the stage counts below exact

  db.wallet = { available: 200, dues: 0 };
  await goHome();
  await waitBody("Wallet ₹200");
  await sleep(1200);
  const r4 = newRequest();
  pushBookingChange(r4);
  await alertUp(6000);
  await openRequest();
  check("with ₹200 the fee is charged (not waived) and Accept works", (await body()).includes("apnabanda fee ₹10") && !(await body()).includes("waived"));
  await T("Accept").click();
  await see("Ready to start");
  check("accepting holds the ₹10 fee (spendable ₹190, held ₹10)", db.wallet.available === 190 && db.wallet.held === 10, JSON.stringify(db.wallet));
  await T("Start trip").click();
  await see("On the way");
  await T("Start job").click();
  await see("Enter customer's code");
  await L("Customer's code").fill("4321");
  await T("Enter customer's code").click();
  await see("Job completed");
  const paid = await body();
  check("completing a job outside the launch period charges the held 3% fee", db.wallet.available === 190 && db.wallet.held === 0 && paid.includes("apnabanda fee ₹10") && paid.includes("You keep ₹339"), JSON.stringify(db.wallet));
  await T("Done").click();
  await see("Jobs");
  await T("Home", true).click();
  await waitBody("Wallet ₹190", 20000).then(() => check("the wallet strip shows the new balance", true)).catch(() => check("the wallet strip shows the new balance", false));

  // the server is the authority: if it disagrees with the screen, its message is shown as written
  await goHome();
  await waitBody("Wallet ₹190");
  await sleep(1200);
  db.wallet = { available: 0, dues: 0 };
  const r5 = newRequest();
  pushBookingChange(r5);
  await alertUp(6000);
  await openRequest();
  await T("Accept").click();
  await see("Recharge ₹49 to accept. Your wallet is below the ₹10 fee.", 8000)
    .then(() => check("a server-side wallet rejection is shown as written", db.storedBookings.find((b) => b.id === r5.id).status === "pending"))
    .catch(async () => check("a server-side wallet rejection is shown as written", false, (await body()).slice(0, 200)));
  await T("Decline").click();
  for (let i = 0; i < 20 && db.storedBookings.find((b) => b.id === r5.id).status !== "cancelled"; i += 1) await sleep(250);

  // ── 8. jobs list ─────────────────────────────────────────────────────────────
  await goHome();
  await see("You're online");
  await T("Jobs", true).click();
  await sleep(2500);
  const stageCount = (label) => page.locator(`[aria-label="${label}"]:visible`).count();
  await page.locator('[aria-label="Completed, 2"]:visible').first().waitFor({ timeout: 15000 })
    .then(async () => check("the jobs tab counts jobs by stage (2 completed, 3 declined)", (await stageCount("Cancelled, 3")) >= 1))
    .catch(async () => check("the jobs tab counts jobs by stage (2 completed, 3 declined)", false, (await body()).slice(0, 200)));
  await L("Completed, 2").click();
  check("each stage has its own tab", (await stageCount("New, 0")) >= 1 && (await stageCount("Started, 0")) >= 1);
  await shot("36-jobs");

  // ── 9. one job at a time: a pro on a job cannot accept another ───────────────
  await goHome();
  await see("You're online");
  await sleep(1200);
  db.wallet = { available: 500, dues: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const current = newRequest({ status: "in_progress", booking_date: today, booking_time: "09:00:00", started_at: new Date().toISOString(), special_instructions: "Current job" });
  pushBookingChange(current, "INSERT");
  await sleep(1500);
  const r6 = newRequest({ booking_time: "20:00:00", special_instructions: "Second job" });
  pushBookingChange(r6, "INSERT");
  await alertUp(8000);
  await waitBody("Finish your current job first", 15000)
    .then(async () => check("the popup of a busy pro says 'Finish your current job first' (not a wallet message)", (await has("You can accept it when your current job ends")) && !(await has("Locked job request"))))
    .catch(async () => check("the popup of a busy pro says 'Finish your current job first'", false, (await body()).slice(0, 300)));
  await shot("37-busy-popup");
  await openRequest();
  const busyScreen = await body();
  const acceptWhileBusy = page.locator('[role="button"]:has-text("Accept"):visible').last();
  check("the request screen explains it, offers 'Open my current job' and Accept is disabled",
    busyScreen.includes("You already have a job at this time. Finish it first.") && (await count("Open my current job")) >= 1 && (await isDisabled(acceptWhileBusy)), busyScreen.slice(0, 260));
  await shot("38-busy-request");
  await T("Open my current job").click();
  await see("Enter customer's code");
  check("the link opens the job that is in the way (in progress, step 3 of 3)", await has("Step 3 of 3"));
  // that job ends: the same request can now be accepted
  current.status = "completed";
  pushBookingChange(current, "UPDATE");
  await sleep(1500);
  await page.goto(BASE + "/provider/job/" + r6.id, { waitUntil: "networkidle" });
  await see("Review the problem");
  await T("Accept").click();
  for (let i = 0; i < 24 && db.storedBookings.find((b) => b.id === r6.id).status !== "confirmed"; i += 1) await sleep(250);
  check("after the first job is completed the same request can be accepted", db.storedBookings.find((b) => b.id === r6.id).status === "confirmed");
  // a stale screen that still sends the accept meets the server rule (the mock mirrors the database trigger)
  const r7 = newRequest({ booking_time: "20:15:00" });
  const res = await page.evaluate(async (id) => {
    const r = await fetch("https://mock.supabase.co/rest/v1/bookings?id=eq." + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "confirmed" }) });
    return { status: r.status, body: await r.text() };
  }, r7.id).catch((e) => ({ status: 0, body: String(e) }));
  check("an overlapping accept that bypasses the screen is refused with the plain message", res.status === 400 && res.body.includes("You already have a job at this time. Finish it first."), JSON.stringify(res).slice(0, 200));

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR", String(e).slice(0, 200));
  console.error("PAGE ERRORS:\n" + errors.slice(0, 6).join("\n---\n"));
  process.exit(2);
});
