// Payments Section 1: the customer can pay a COMPLETED booking online (Razorpay) or pay the pro directly.
// The app asks the server for an order (booking id only, never an amount) and never marks anything paid itself.
// Razorpay Checkout is a native module, so on web the test stops at "works in the phone app"; the polling after a
// real payment is checked on a phone (docs/PAYMENTS_SETUP.md). See e2e-web/README.md for how to run it.
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
  const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const has = async (t) => (await body()).includes(t);
  const waitBody = (text, timeout = 15000) =>
    page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").includes(t), text, { timeout });
  const count = (text) => page.getByText(text, { exact: false }).locator("visible=true").count();
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });

  // sign up as a customer
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await T("Welcome back").waitFor({ timeout: 60000 });
  await T("New here? Create an account").click();
  await L("Full name").fill("Meera Shah");
  await L("Email").fill("pay@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await T("Create account").click();
  await T("How will you use HandyFix?", false).waitFor({ state: "visible" });
  await T("I need a service").click();
  await T("Continue").click();
  await waitBody("What do you need fixed today?");
  const userId = db.users["pay@example.com"].id;

  let seq = 0;
  const seed = (over = {}) => {
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    const row = {
      id: "b-pay" + ++seq, provider_id: "p-asha", service_id: "s-plumb", customer_id: userId, status: "completed",
      created_at: new Date().toISOString(), booking_date: today, booking_time: "10:00:00", address: "12 MG Road", city: "Gandhinagar",
      pincode: "382010", provider_amount: 949, total_amount: 949, platform_fee: 0, sub_item_name: "AC service", payment_status: "unpaid",
      completed_at: new Date().toISOString(), ...over,
    };
    db.storedBookings.push(row);
    return row;
  };
  const open = async (row) => {
    await page.goto(`${BASE}/customer/booking/${row.id}`, { waitUntil: "domcontentloaded" });
    await waitBody("Booking");
    await page.waitForTimeout(800);
  };
  const appMarkedPaid = () => (db.patches || []).some((p) => "payment_status" in p.patch || "payment_method" in p.patch);

  // ── 1. completed and unpaid: both ways to pay ────────────────────────────────
  const b1 = seed();
  await open(b1);
  await waitBody("Pay ₹949 online");
  check("a completed, unpaid booking offers 'Pay ₹949 online' and 'I'll pay Asha directly'",
    (await has("How do you want to pay?")) && (await count("I'll pay Asha directly")) >= 1);
  check("the cash/UPI path stays in the banner, with the online option mentioned",
    await has("All done. Pay Asha ₹949 directly by UPI or cash, or pay online here."));
  await shot("70-booking-pay-choice");

  await T("I'll pay Asha directly").click();
  await waitBody("Pay Asha ₹949 by cash or UPI.");
  check("choosing to pay directly hides the online button and says how to pay", (await count("Pay ₹949 online")) === 0);
  await T("Pay online instead").click();
  await waitBody("Pay ₹949 online");
  check("the customer can switch back to paying online", true);

  // ── 2. paying asks the server, with the booking id only ──────────────────────
  await T("Pay ₹949 online").click();
  await waitBody("Online payment works in the apnabanda phone app");
  const call = db.calls.find((c) => c.fn === "create-booking-payment-order");
  check("the app asks the server for an order with the booking id only (no amount)",
    !!call && call.body.booking_id === b1.id && !("amount" in call.body) && !("amount_paise" in call.body), JSON.stringify(call && call.body));
  check("the server works out ₹949 itself (94900 paise)", db.bookingOrders?.[0]?.amount_paise === 94900);
  await T("Pay ₹949 online").click();
  await waitBody("Online payment works in the apnabanda phone app");
  check("a second tap reuses the open order instead of creating another", db.bookingOrders.length === 1);
  check("the app never marks the booking paid itself", !appMarkedPaid() && b1.payment_status === "unpaid");

  // ── 3. the server refuses: its message is shown ──────────────────────────────
  db.bookingPaymentRefusal = "This booking is already paid.";
  await open(b1);
  await waitBody("Pay ₹949 online");
  await T("Pay ₹949 online").click();
  await waitBody("This booking is already paid.");
  check("a server refusal is shown in plain words", true);
  db.bookingPaymentRefusal = null;

  // ── 4. no online payment before the job is completed ─────────────────────────
  const b2 = seed({ status: "in_progress", completed_at: null });
  await open(b2);
  await waitBody("Work in progress").catch(() => undefined);
  check("while the job is in progress there is no online payment yet (the bill is not final)", (await count("online")) === 0);

  // ── 5. an extra waiting for approval blocks paying ───────────────────────────
  const b3 = seed();
  (db.tables.booking_extras ??= []).push({ id: "x-pay", booking_id: b3.id, provider_id: "p-asha", title: "Gas refill", kind: "service", amount: 500, status: "pending", created_at: new Date().toISOString() });
  await open(b3);
  await waitBody("Approve or decline the extra work first", 10000).catch(() => undefined);
  check("an extra waiting for approval blocks paying online", (await has("Approve or decline the extra work first")) && (await count("Pay ₹949 online")) === 0);

  // ── 6. paid, being confirmed ─────────────────────────────────────────────────
  const b4 = seed({ payment_status: "paid" });
  await open(b4);
  await waitBody("Do not pay Asha again");
  check("a paid booking shows Paid, no pay button and no 'pay directly' banner",
    (await count("Pay ₹949 online")) === 0 && !(await has("directly by UPI or cash")));
  await shot("71-booking-paid");
  const b5 = seed({ payment_status: "pending" });
  await open(b5);
  await waitBody("Your payment is being confirmed");
  check("a payment being confirmed tells the customer not to pay again", (await count("Pay ₹949 online")) === 0);

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
