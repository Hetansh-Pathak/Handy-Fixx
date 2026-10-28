// My services (proposal 20261113000002): a pro picks services, unticks jobs and sets an own rate inside the admin band;
// customers only see pros who do the chosen job, at that pro's rate. See e2e-web/README.md for how to run it.
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
  const open = async () => {
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
    const count = (text, exact = true) => page.getByText(text, { exact }).locator("visible=true").count();
    const see = (text, timeout = 15000) => T(text, false).waitFor({ state: "visible", timeout });
    const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
    return { page, T, L, count, see, body, shot };
  };

  // ════════════════════════ A. the pro ════════════════════════
  const P = await open();
  await P.page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await P.see("Welcome back", 60000);
  await P.T("New here? Create an account").click();
  await P.L("Full name").fill("Rajesh Kumar");
  await P.L("Email").fill("rajesh@example.com");
  await P.L("Password").fill("secret123");
  await P.L("Confirm password").fill("secret123");
  await P.T("Create account").click();
  await P.see("How will you use HandyFix?");
  await P.T("I'm a pro").click();
  await P.L("Mobile number").fill("98765 43211");
  await P.T("Continue").click();
  await P.see("Verify your identity to start");
  Object.assign(db.providerRows[0], { status: "active", kyc_status: "approved", kyc_reviewed_at: new Date().toISOString(), total_jobs: 0 });

  await P.page.goto(`${BASE}/provider/profile`, { waitUntil: "networkidle" });
  await P.see("Services I offer");
  await P.T("Services I offer").click();
  await P.see("Turn on the services you do");
  check("the profile's Services row opens My services with every catalogue service", (await P.count("Plumbing")) >= 1 && (await P.count("House Cleaning")) >= 1);

  await P.T("Save services").click();
  await P.see("Turn on at least one service you do.");
  check("saving with no service is refused", true);

  await P.page.locator('[aria-label="Plumbing on or off"]').first().click({ force: true });
  await P.see("All 2 jobs");
  check("turning a service on ticks every job in it", true);
  await P.T("Choose jobs and prices").click();
  await P.see("Tap repair");
  check("the jobs are listed with their HandyFix prices", (await P.body()).includes("₹199") && (await P.body()).includes("₹349"));
  check("an own price is offered only for a job with an admin band", (await P.page.locator('[aria-label="Your price for Pipe leak"]:visible').count()) === 1 &&
    (await P.page.locator('[aria-label="Your price for Tap repair"]:visible').count()) === 0 && (await P.body()).includes("Allowed ₹249 to ₹449"));

  await P.T("Tap repair").click();
  await P.see("1 of 2 jobs");
  check("unticking a job updates the count", true);
  await P.T("Untick all").click();
  await P.T("Save services").click();
  await P.see("Tick at least one job in Plumbing");
  check("a service with no job ticked is refused", true);
  await P.T("Pipe leak").click();

  await P.L("Your price for Pipe leak").fill("600");
  await P.T("Save services").click();
  await P.see("Set a price between ₹249 and ₹449.");
  check("a price outside the band is refused before saving", db.providerSubItems.length === 0);
  await P.L("Your price for Pipe leak").fill("399");
  await P.shot("80-my-services");
  await P.T("Save services").click();
  await P.page.waitForFunction(() => true);
  for (let i = 0; i < 50 && db.providerSubItems.length === 0; i++) await new Promise((r) => setTimeout(r, 100));
  const saved = db.providerSubItems.map((r) => `${r.sub_item_id}:${r.custom_price}`).join(",");
  check("saving stores the service and only the ticked job with its own rate",
    JSON.stringify(db.providerRows[0].service_ids) === '["s-plumb"]' && saved === "si-leak:399", `${JSON.stringify(db.providerRows[0].service_ids)} ${saved}`);

  // Reached from Profile like on a phone (a direct web load has no screen to go back to after saving).
  await P.page.goto(`${BASE}/provider/profile`, { waitUntil: "networkidle" });
  await P.see("Services I offer");
  check("the profile lists the saved service", (await P.body()).includes("Plumbing"));
  await P.T("Services I offer").click();
  await P.see("1 of 2 jobs");
  await P.T("Choose jobs and prices").click();
  check("reopening shows what was saved", (await P.page.locator('[aria-label="Your price for Pipe leak"]:visible').inputValue()) === "399");
  await P.T("Tap repair").click();
  await P.L("Your price for Pipe leak").fill("");
  await P.T("Save services").click();
  for (let i = 0; i < 50 && db.providerSubItems.length !== 0; i++) await new Promise((r) => setTimeout(r, 100));
  check("ticking every job at the HandyFix price removes the stored rows", db.providerSubItems.length === 0, JSON.stringify(db.providerSubItems));

  db.subItemsTableMissing = true;
  await P.page.goto(`${BASE}/provider/services`, { waitUntil: "networkidle" });
  await P.see("switches on with the next HandyFix update");
  check("before the database change, the screen still saves services and hides jobs", (await P.count("Choose jobs and prices")) === 0);
  db.subItemsTableMissing = false;

  await P.page.goto(`${BASE}/provider/edit-profile`, { waitUntil: "networkidle" });
  await P.see("Choose services and jobs");
  check("Edit profile links to My services instead of its own chips", (await P.body()).includes("Plumbing"));

  // ════════════════════════ B. the customer ════════════════════════
  db.providerSubItems = [{ provider_id: "p-asha", sub_item_id: "si-leak", service_id: "s-plumb", custom_price: 399 }];
  const C = await open();
  await C.page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await C.see("Welcome back", 60000);
  await C.T("New here? Create an account").click();
  await C.L("Full name").fill("Meera Shah");
  await C.L("Email").fill("meera@example.com");
  await C.L("Password").fill("secret123");
  await C.L("Confirm password").fill("secret123");
  await C.T("Create account").click();
  await C.see("How will you use HandyFix?");
  await C.T("I need a service").click();
  await C.T("Continue").click();
  await C.see("What do you need fixed today?");
  await C.T("Services").click();
  await C.see("All services");
  await C.L("Your area").fill("Gandhinagar");
  await C.page.locator('[aria-label="Plumbing"]:visible').last().click();
  await C.see("What do you need?");
  await C.T("Tap repair").click();
  await C.see("Ravi Shah");
  check("a pro who did not tick the job is hidden for it", (await C.count("Asha Patel", false)) === 0);
  await C.T("Pipe leak").click();
  await C.see("Asha Patel");
  await C.shot("81-customer-pro-rate");
  check("for a ticked job the pro shows their own rate; others show the HandyFix price",
    (await C.page.locator("text=/^₹399$/").locator("visible=true").count()) >= 1 && (await C.count("Ravi Shah", false)) >= 1);

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
