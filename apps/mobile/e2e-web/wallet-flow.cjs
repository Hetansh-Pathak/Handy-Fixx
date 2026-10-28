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
  const openWallet = async () => { await page.goto(`${BASE}/provider/wallet`, { waitUntil: "networkidle" }); await waitBody("Add money"); };
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
  const today = new Date().toISOString().slice(0, 10);
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
  await waitBody("Add money");
  await waitBody("Wallet topped", 1).catch(() => undefined);
  await waitBody("HandyFix fee");
  const w = await body();
  check("the wallet shows the balance and no dues when there are none", (await L("Wallet balance").innerText()) === "₹250" && !w.includes("Dues"));
  check("the history lists the fee as a red minus and the top-up as a plus", w.includes("-₹15") && w.includes("+₹500") && w.includes("Wallet top-up"));
  check("earnings count completed jobs only", w.includes("₹500 · 2 jobs") && !w.includes("₹1,499") && w.includes("Today ₹500"));
  check("with the launch over, the flat fee rule is explained", w.includes("flat ₹15 / ₹30 / ₹50"));
  await shot("50-wallet");

  // ── 2. top-up: validation, then the order ────────────────────────────────────
  await amountField(0).fill("50");
  await T("Pay with Razorpay").click();
  await waitBody("Minimum top-up is ₹100");
  check("a top-up below ₹100 is refused before anything is sent", !db.calls.some((c) => c.fn === "create-wallet-topup-order"));
  await amountField(0).fill("150");
  await T("Pay with Razorpay").click();
  await waitBody("phone app");
  check("a valid top-up asks the server for an order of that amount", db.calls.some((c) => c.fn === "create-wallet-topup-order" && c.body.amount === 150));
  check("on web the native checkout is explained instead of crashing", await has("Top-up works in the HandyFix phone app"));
  await page.getByRole("button", { name: "₹500", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Amount (₹)"]')?.value === "500", null, { timeout: 4000 }).catch(() => undefined);
  check("a quick-pick chip fills the amount", (await amountField(0).inputValue()) === "500", await amountField(0).inputValue());

  // ── 3. withdrawal ────────────────────────────────────────────────────────────
  db.wallet = { available: 500, dues: 0 };
  await openWallet();
  await amountField(1).fill("100");
  await T("Request withdrawal").click();
  await waitBody("The minimum withdrawal is ₹200");
  check("a withdrawal under the minimum shows the minimum", true);
  await amountField(1).fill("9000");
  await T("Request withdrawal").click();
  await waitBody("more than your wallet balance");
  check("a withdrawal above the balance is refused", true);
  await amountField(1).fill("300");
  await T("Request withdrawal").click();
  await waitBody("Withdrawal of ₹300 requested");
  await waitBody("pending");
  check("a valid withdrawal reduces the balance and is listed as pending", (await L("Wallet balance").innerText()) === "₹200" && (await has("₹300 · pending")));
  await waitBody("Withdrawal");
  check("the history shows the withdrawal as money out", (await has("-₹300")));
  await shot("51-withdraw");

  db.payoutDetails = false;
  await amountField(1).fill("200");
  await T("Request withdrawal").click();
  await waitBody("Add your UPI id or bank account first");
  check("without payout details the pro is told what to add", true);
  db.payoutDetails = true;

  // ── 4. dues ──────────────────────────────────────────────────────────────────
  db.wallet = { available: 0, dues: 250 };
  await openWallet();
  const d = await body();
  check("dues are shown in red and top-ups clear them first", (await L("Wallet dues").innerText()) === "₹250" && d.includes("Top-ups clear your dues first"));
  check("quick picks start above the dues", d.includes("₹300") && d.includes("₹500") && d.includes("₹1,000") && !/(^|\s)₹100(\s|$)/.test(d.split("Add money")[1].split("Amount")[0]));
  check("withdrawing is closed until the dues are cleared", d.includes("Clear your dues first") && !(await has("Request withdrawal")));
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
