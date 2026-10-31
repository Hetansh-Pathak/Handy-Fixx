// Slice 5a end-to-end: the pro's wallet (balance, dues, history), top-up checks, withdrawal and earnings.
// Razorpay's native checkout cannot run on web: we check the order is created and the failure is explained.
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
  const see = (text, timeout = 15000) => T(text, false).waitFor({ state: "visible", timeout });
  const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const norm = (t) => t.replace(/\s+/g, " ").toLowerCase();
  const has = async (t) => norm(await body()).includes(norm(t));
  const waitBody = (text, timeout = 12000) =>
    page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").toLowerCase().includes(t), norm(text), { timeout });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
  const openWallet = async () => { await page.goto(`${BASE}/provider/wallet`, { waitUntil: "networkidle" }); await waitBody("Recharge"); };
  const amountField = (i) => page.locator('[aria-label="Amount (₹)"]:visible').nth(i);

  // ── sign up as an approved pro ───────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await see("Welcome back", 60000);
  await T("New here? Create an account").click();
  await L("Full name").fill("Rajesh Kumar");
  await L("Email").fill("rajesh@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await T("Create account").click();
  await see("How will you use HandyFix?");
  await T("I'm a pro").click();
  await L("Mobile number").fill("98765 43211");
  await T("Continue").click();
  await see("Verify your identity to start");
  Object.assign(db.providerRows[0], { status: "active", kyc_status: "approved", kyc_reviewed_at: new Date(Date.now() - 200 * 86400000).toISOString(), total_jobs: 40, upi_id: "ravi@okaxis" });
  const pid = db.providerRows[0].id;
  // India date, like the app ("today" is India time; UTC would be yesterday after 18:30 UTC).
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  db.storedBookings.push(
    { id: "w1", provider_id: pid, status: "completed", booking_date: today, provider_amount: 300, total_amount: 300, created_at: new Date().toISOString() },
    { id: "w2", provider_id: pid, status: "completed", booking_date: today, provider_amount: 200, total_amount: 200, created_at: new Date().toISOString() },
    { id: "w3", provider_id: pid, status: "cancelled", booking_date: today, provider_amount: 999, total_amount: 999, created_at: new Date().toISOString() },
  );
  db.launchActive = false;
  db.wallet = { available: 250, dues: 0 };
  db.ledger = [
    { id: "l2", type: "cash_fee", amount: -15, note: null, created_at: "2026-10-20T10:00:00Z" },
    { id: "l1", type: "topup", amount: 500, note: null, created_at: "2026-10-19T10:00:00Z" },
  ];

  // ── 1. home → wallet ─────────────────────────────────────────────────────────
  await page.goto(`${BASE}/provider`, { waitUntil: "networkidle" });
  await see("Open wallet");
  await T("Open wallet").click();
  await waitBody("Recharge");
  await waitBody("HandyFix fee");
  const w = await body();
  check("the headline is how many jobs the balance covers (₹250 / ₹12 fee on a ₹400 job = 20)", (await L("Jobs covered").innerText()) === "Covers about 20 more jobs");
  check("the rupee balance is shown under it, with no dues when there are none", (await L("Wallet balance").innerText()) === "₹250 available" && !w.includes("You owe"));
  check("the history lists the fee as a red minus and the top-up as a plus", w.includes("-₹15") && w.includes("+₹500") && w.includes("Wallet top-up"));
  check("earnings count completed jobs only", w.includes("₹500 · 2 jobs") && !w.includes("₹1,499") && w.includes("Today ₹500"));
  check("with the launch over, the 3% fee rule is explained", w.includes("3% per job, min ₹5, max ₹50"));
  check("nothing is shown as reserved when no job holds a fee", !w.includes("reserved for jobs"));
  await shot("50-wallet");

  // ── 1b. a customer paid a job online (Payments Section 2) ───────────────────
  const inTwoDays = new Date(Date.now() + 47 * 3600000).toISOString();
  Object.assign(db.storedBookings.find((b) => b.id === "w1"), { payment_status: "paid", payment_method: "online", completed_at: new Date().toISOString() });
  db.ledger = [
    { id: "l3", type: "online_credit", amount: 300, note: "Customer paid online (Razorpay)", booking_id: "w1", created_at: new Date().toISOString(), available_at: inTwoDays, razorpay_payment_id: "pay_1" },
    ...db.ledger,
  ];
  await openWallet();
  await waitBody("Paid online");
  check("the online payment is in the history as 'Paid online' +₹300, on hold until a date", (await has("+₹300")) && (await has("On hold until")));
  check("the headline shows the money on hold, separate from the available balance",
    (await L("On hold").innerText()).startsWith("₹300 from online payments on hold") && (await L("Wallet balance").innerText()) === "₹250 available");
  await shot("53-wallet-on-hold");
  await page.goto(`${BASE}/provider/job/w1`, { waitUntil: "networkidle" });
  await waitBody("Job completed");
  check("the job screen says 'Paid online ₹300' and not to take cash", (await L("Online payment").innerText()).includes("Paid online ₹300") && (await has("Do not take cash for this job")));
  Object.assign(db.storedBookings.find((b) => b.id === "w2"), { payment_status: "paid", payment_method: "cash" });
  await page.goto(`${BASE}/provider/job/w2`, { waitUntil: "networkidle" });
  await waitBody("Job completed");
  check("a job paid in cash does not say 'Paid online'", !(await has("Paid online")));
  db.ledger = db.ledger.filter((l) => l.id !== "l3");
  await openWallet();

  // ── 2. recharge packs ────────────────────────────────────────────────────────
  const packs = await body();
  check("three packs are offered, ₹99 marked most popular, with no free amount field",
    packs.includes("₹49") && packs.includes("₹99") && packs.includes("₹199") && /most popular/i.test(packs) && !packs.includes("Pay with Razorpay") && !packs.includes("₹100 to ₹50,000"));
  check("each pack says roughly how many jobs it covers", packs.includes("about 4 jobs") && packs.includes("about 8 jobs") && packs.includes("about 16 jobs"));
  await L("Recharge ₹99").click();
  await waitBody("phone app");
  check("tapping a pack asks the server for an order for exactly that pack", db.calls.some((c) => c.fn === "create-wallet-topup-order" && c.body.pack === 99 && c.body.amount === undefined));
  check("on web the native checkout is explained instead of crashing", await has("Top-up works in the HandyFix phone app"));

  db.wallet = { available: 238, dues: 0, held: 12 };
  await openWallet();
  check("money held for an accepted job is shown and not counted as available",
    (await has("₹12 reserved for jobs you accepted")) && (await L("Wallet balance").innerText()) === "₹238 available",
    `${await L("Wallet balance").innerText()} | ${(await body()).slice(0, 300)}`);

  // ── 3. withdrawal ────────────────────────────────────────────────────────────
  db.wallet = { available: 500, dues: 0 };
  await openWallet();
  await amountField(0).fill("100");
  await T("Request withdrawal").click();
  await waitBody("The minimum withdrawal is ₹200");
  check("a withdrawal under the minimum shows the minimum", true);
  await amountField(0).fill("9000");
  await T("Request withdrawal").click();
  await waitBody("more than your wallet balance");
  check("a withdrawal above the balance is refused", true);
  await amountField(0).fill("300");
  await T("Request withdrawal").click();
  await waitBody("Withdrawal of ₹300 requested");
  await waitBody("pending");
  check("a valid withdrawal reduces the balance and is listed as pending", (await L("Wallet balance").innerText()) === "₹200 available" && (await has("₹300 · pending")));
  await waitBody("Withdrawal");
  check("the history shows the withdrawal as money out", (await has("-₹300")));
  await shot("51-withdraw");

  db.payoutDetails = false;
  await amountField(0).fill("200");
  await T("Request withdrawal").click();
  await waitBody("Add your UPI id or bank account first");
  check("without payout details the pro is told what to add", true);
  db.payoutDetails = true;

  // ── 4. dues ──────────────────────────────────────────────────────────────────
  db.wallet = { available: 0, dues: 250 };
  await openWallet();
  const d = await body();
  check("old dues are shown in red and a recharge clears them first", (await L("Wallet dues").innerText()) === "You owe ₹250. A recharge clears it first.");
  check("the headline asks for a recharge", (await L("Jobs covered").innerText()) === "Recharge to accept new jobs");
  check("withdrawing is closed until the dues are cleared", d.includes("Recharge to clear what you owe first") && !(await has("Request withdrawal")));
  await shot("52-dues");

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
