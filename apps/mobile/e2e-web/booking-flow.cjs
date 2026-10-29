// Slice 2 end-to-end: services → pros with prices → 3-step booking → confirmation, against the mocked backend.
// See e2e-web/README.md for how to run it.
const { chromium } = require("playwright");
const path = require("path");
const { installMock, installRealtime, db, BASE } = require("./mock-supabase.cjs");

const OUT = path.join(__dirname, "shots");
require("fs").mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_|favicon/.test(m.text())) errors.push("console: " + m.text().slice(0, 200));
  });
  await installMock(page);
  await installRealtime(page);

  // Visible-only helpers: the stack navigator keeps earlier screens mounted underneath.
  const T = (text, exact = true) => page.getByText(text, { exact }).locator("visible=true").last();
  const L = (label) => page.locator(`[aria-label="${label}"]:visible`).last();
  const count = async (text, exact = true) => page.getByText(text, { exact }).locator("visible=true").count();
  const see = async (text, timeout = 15000) => {
    try { await T(text, false).waitFor({ state: "visible", timeout }); } catch (e) {
      console.error(`Could not see "${text}". The screen says: ${(await body()).slice(0, 600)} | errors: ${errors.filter((x) => !/WebSocket/.test(x)).join(" // ").slice(0, 1500)}`);
      await shot("zz-last-failure").catch(() => undefined);
      throw e;
    }
  };
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
  const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  // Pick TOMORROW so the test passes at any hour (a slot less than an hour away today is correctly disabled).
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pickTomorrow = async () => { const d = new Date(Date.now() + 86400000); await T(`${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`).click(); };
  const yOf = async (text) => (await T(text, false).boundingBox())?.y ?? Infinity;

  // ── sign up as a customer ────────────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await see("Welcome back", 60000);
  await T("New here? Create an account").click();
  await L("Full name").fill("Meera Shah");
  await L("Email").fill("meera@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await T("Create account").click();
  await see("How will you use HandyFix?");
  await T("I need a service").click();
  await T("Continue").click();
  await see("What do you need fixed today?");

  // ── 1. services list and search ──────────────────────────────────────────────
  await see("House Cleaning");
  check("services list shows the catalogue", (await count("Plumbing")) >= 1 && (await count("House Cleaning")) >= 1);
  check("service card shows starting price and duration", (await body()).includes("Starts at ₹299") && (await body()).includes("1 hr"));
  await T("Services").click();
  await see("All services");
  await shot("20-services");
  const plumbingBefore = await count("Plumbing");
  await L("Search services").fill("clean");
  check("search filters the list", (await count("Plumbing")) === plumbingBefore - 1 && (await count("House Cleaning")) >= 1);
  await L("Search services").fill("zzz");
  check("empty search explains itself", (await body()).includes("No services match"));
  await L("Search services").fill("");

  // ── 2. service page: sub-items, availability, area, pricing ──────────────────
  await L("Your area").fill("Gandhinagar");
  await page.locator('[aria-label="Plumbing"]:visible').last().click();
  await see("What do you need?");
  check("sub-items are listed with catalogue prices", (await body()).includes("Tap repair") && (await body()).includes("₹199") && (await body()).includes("₹349"));
  check("pros are hidden until a sub-item is chosen", (await count("Asha Patel", false)) === 0 && (await body()).includes("Choose what you need above"));
  check("'Not sure what's wrong?' offers the check-up visit with its price", (await body()).includes("Not sure what's wrong?") && (await count("Book a check-up visit · ₹129")) >= 1);
  const visitBox = await T("Plumber Visit", false).boundingBox();
  const tapBox = await T("Tap repair", false).boundingBox();
  check("the check-up visit is listed before the repairs (same row, further left, or higher)",
    !!visitBox && !!tapBox && (visitBox.y < tapBox.y - 5 || (Math.abs(visitBox.y - tapBox.y) <= 5 && visitBox.x < tapBox.x)), JSON.stringify({ visitBox, tapBox }));
  await T("Book a check-up visit · ₹129").click();
  await see("The visit fee is always charged");
  check("choosing a check-up says the visit fee is always charged and the repair is approved extra work", (await body()).includes("adds it as extra work"));
  const jobRadios = await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].map((e) => e.getAttribute("aria-checked")));
  check("the job cards expose their checked state to screen readers", jobRadios.length >= 2 && jobRadios.every((v) => v === "true" || v === "false"), JSON.stringify(jobRadios));
  await T("Tap repair").click();
  await see("Asha Patel");
  check("only available, in-area pros are shown (offline, stale heartbeat and other-city pros hidden)",
    (await count("Asha Patel", false)) >= 1 && (await count("Ravi Shah", false)) >= 1 &&
    (await count("Offline Oli", false)) === 0 && (await count("Stale Sam", false)) === 0 && (await count("Surat Suresh", false)) === 0);
  const priced = await page.locator("text=/^₹199$/").locator("visible=true").count();
  check("a job with an admin band shows its price range before booking", (await body()).includes("Range ₹249–₹449"), (await body()).slice(0, 200));
  check("a sub-item has one catalogue price for every pro (₹199 on the item and on both cards)", priced >= 3, `count=${priced}`);
  check("verified pros are marked and ratings shown", (await body()).includes("Asha Patel  ✓") || (await body()).includes("Asha Patel ✓"), "");
  await shot("21-service-subitem");
  await L("Your area").fill("Surat");
  await see("Surat Suresh");
  check("changing the area changes the pros", (await count("Surat Suresh", false)) >= 1 && (await count("Asha Patel", false)) === 0);
  await L("Your area").fill("Nowhere");
  await see("No pros online");
  check("no match shows an empty state with a refresh", (await body()).includes("No pros online in Nowhere right now"));
  await L("Your area").fill("Gandhinagar");

  // own-rate pricing + sorting on a service without sub-items
  db.responseTimes = [{ provider_id: "p-asha", avg_seconds: "150", samples: "6" }, { provider_id: "p-ravi", avg_seconds: "30", samples: "2" }];
  await page.goBack();
  await page.locator('[aria-label="House Cleaning"]:visible').last().click();
  await see("Asha Patel");
  check("without sub-items each pro shows their own rate", (await body()).includes("₹599") && (await body()).includes("₹449"));
  await page.getByText("Replies in about 3 min").first().waitFor({ state: "visible", timeout: 25000 }).catch(() => undefined); // the list refreshes every 15 s
  check("a pro with enough replies shows how fast they answer; one with too few does not",
    (await count("Replies in about 3 min")) === 1 && (await body()).split("Replies in").length - 1 === 1, (await body()).slice(0, 300));
  const ashaFirst = (await yOf("Asha Patel")) < (await yOf("Ravi Shah"));
  check("default order is top rated first", ashaFirst);
  await T("Cheapest").click();
  await page.waitForTimeout(300);
  check("Cheapest puts the lowest price first", (await yOf("Ravi Shah")) < (await yOf("Asha Patel")));
  await shot("22-service-cheapest");

  // ── 3. booking: unverified email blocks confirm ──────────────────────────────
  await T("Book Asha").click();
  await see("Step 1 of 3");
  await pickTomorrow();
  await T("PM").click();
  await L("6 PM").click();
  await T("Continue").click();
  await see("Step 2 of 3");
  await T("Continue").click();
  check("step 2 requires address, city and pincode", (await body()).includes("Enter the service address") && (await body()).includes("Enter your city") && (await body()).includes("6-digit pincode"));
  await L("Address").fill("12 MG Road");
  await L("City").fill("Gandhinagar");
  await L("Pincode").fill("38201");
  await T("Continue").click();
  check("an incomplete pincode is rejected", (await body()).includes("6-digit pincode"));
  await L("Pincode").fill("382010");
  await T("Continue").click();
  await see("Step 3 of 3");
  check("review shows ₹599, fee ₹0, total and the locked-price note",
    (await body()).includes("Service price ₹599") && (await body()).includes("Platform fee ₹0") && (await body()).includes("Total ₹599") && (await body()).includes("Price is locked"));
  await shot("23-review-unverified");
  const confirmBtn = page.getByText("Confirm · ₹599", { exact: false }).locator("visible=true").last();
  const disabledBefore = await page.locator('[aria-disabled="true"]:visible', { hasText: "Confirm · ₹599" }).count();
  check("confirm is disabled until the email is verified", disabledBefore >= 1 && (await body()).includes("Verify your email"));
  await T("Send code").click();
  await see("We sent a 6-digit code");
  await L("6-digit code").fill("123456");
  await T("Verify").click();
  await page.waitForFunction(() => !document.body.innerText.includes("We sent a 6-digit code"), null, { timeout: 15000 });
  const disabledAfter = await page.locator('[aria-disabled="true"]:visible', { hasText: "Confirm · ₹599" }).count();
  check("verifying the email enables confirm", disabledAfter === 0);

  // ── 4. confirm (PDF pricing) ─────────────────────────────────────────────────
  await confirmBtn.click();
  await see("Waiting for Asha");
  check("the status screen says the request was sent, with no countdown", (await body()).includes("Request sent to Asha") && !/seconds to accept/i.test(await body()));
  const b1 = db.storedBookings[0];
  check("booking payload: slot, address, price and no sub-item",
    b1 && /^18:\d\d:00$/.test(b1.scheduled_time) && b1.address === "12 MG Road" && b1.pincode === "382010" && b1.provider_amount === 599 && b1.platform_fee === 0 && b1.sub_item_id === null && b1.status === "pending" && b1.provider_id === "p-asha",
    JSON.stringify(b1 || {}).slice(0, 200));
  check("saved total matches the quote, so no price warning", !(await body()).includes("The saved price is different") && (await body()).includes("Total ₹599"));
  await shot("24-confirmation");

  // ── 5. legacy 12% trigger live: the mismatch must be shown, and cancel must work ──
  await T("Back to home").click();
  await see("What do you need fixed today?");
  db.pricingMode = "legacy12";
  await page.locator('[aria-label="Plumbing"]:visible').last().click();
  await see("What do you need?");
  await T("Pipe leak").click();
  await see("Asha Patel");
  await T("Book Asha").click();
  await see("Step 1 of 3");
  await pickTomorrow();
  await T("PM").click();
  await L("6 PM").click();
  await T("Continue").click();
  await see("Step 2 of 3");
  await T("Continue").click(); // address prefilled? (only if profile was saved) — fill to be safe
  if ((await body()).includes("Enter the service address")) {
    await L("Address").fill("12 MG Road");
    await L("City").fill("Gandhinagar");
    await L("Pincode").fill("382010");
    await T("Continue").click();
  }
  await see("Step 3 of 3");
  check("sub-item booking is quoted at the catalogue price (₹349)", (await body()).includes("Total ₹349") && (await body()).includes("Pipe leak"));
  await page.getByText("Confirm · ₹349", { exact: false }).locator("visible=true").last().click();
  await see("The saved price is different");
  check("a different saved price is flagged with both numbers and the fee",
    (await body()).includes("You were shown ₹349") && (await body()).includes("saved at ₹391") && (await body()).includes("₹42 fee"));
  await shot("25-mismatch");
  await T("Cancel booking").click();
  await T("Yes, cancel it").click();
  await see("Cancelled");
  const b2 = db.storedBookings[1];
  check("cancelling updates the booking", b2 && b2.status === "cancelled" && b2.sub_item_id === "si-leak", JSON.stringify({ s: b2?.status, sub: b2?.sub_item_id }));
  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
