// Port checkpoints 2-6 end-to-end: the pro's identity check, working hours, reviews and notifications, and the customer's
// chat (with phone-number blocking), rating and late-cancel warning. See e2e-web/README.md for how to run it.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const watch = (page) => {
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|ERR_|favicon/.test(m.text())) errors.push("console: " + m.text().slice(0, 200));
    });
  };
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    watch(page);
    await installMock(page);
    await installRealtime(page);
    return page;
  };

  const helpers = (page) => {
    const T = (text, exact = true) => page.getByText(text, { exact }).locator("visible=true").last();
    const L = (label) => page.locator(`[aria-label="${label}"]:visible`).last();
    const body = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const norm = (t) => t.replace(/\s+/g, " ").toLowerCase();
    const has = async (t) => norm(await body()).includes(norm(t));
    const waitBody = (text, timeout = 15000) =>
      page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").toLowerCase().includes(t), norm(text), { timeout });
    const see = async (text, timeout = 15000) => {
      try { await T(text, false).waitFor({ state: "visible", timeout }); } catch (e) {
        console.error(`Could not see "${text}". The screen says: ${(await body()).slice(0, 500)} | errors: ${errors.filter((x) => !/WebSocket/.test(x)).join(" // ").slice(0, 800)}`);
        throw e;
      }
    };
    const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
    const go = (p) => page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
    return { T, L, body, has, waitBody, see, shot, go };
  };

  // ════════════════════════ A. the pro ════════════════════════
  const pro = await open();
  const P = helpers(pro);
  await pro.goto(`${BASE}/`, { waitUntil: "networkidle" });
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
  check("a new pro is told to verify, with a button that starts it", (await P.has("Start verification")) && (await P.has("9-step identity check")));
  await P.T("Start verification").click();
  await P.see("Keep these ready");
  check("the identity page lists what to keep ready", (await P.has("Your Aadhaar card")) && (await P.has("Your PAN card")) && (await P.has("selfie")));
  await P.T("Start verification").click();
  await P.see("Step 1 of 9");
  await P.shot("60-kyc-step1");

  // step 1: name
  await P.L("First name").fill("");
  await P.L("Last name").fill("");
  await P.T("Save and continue").click();
  await P.see("Enter your first name");
  check("step 1 asks for the first name", true);
  await P.L("First name").fill("R");
  await P.L("Last name").fill("Kumar");
  await P.T("Save and continue").click();
  await P.see("at least 2 letters");
  check("a one-letter name is refused", true);
  await P.L("First name").fill("Rajesh");
  await P.T("Save and continue").click();
  await P.see("Step 2 of 9");
  check("step 1 saves the name on the pro's row and moves on",
    db.providerRows[0].first_name === "Rajesh" && db.providerRows[0].last_name === "Kumar" && db.providerRows[0].onboarding_step === 2,
    JSON.stringify({ f: db.providerRows[0].first_name, s: db.providerRows[0].onboarding_step }));

  // step 2: date of birth
  await P.L("Date of birth").fill("10102015");
  check("the date is formatted while typing", (await P.L("Date of birth").inputValue()) === "10/10/2015");
  await P.T("Save and continue").click();
  await P.see("18 or older");
  check("someone under 18 cannot continue", true);
  await P.L("Date of birth").fill("31021990");
  await P.T("Save and continue").click();
  await P.waitBody("not a real date");
  check("an impossible date (31 February) is refused", true);
  await P.L("Date of birth").fill("05031990");
  await P.T("Save and continue").click();
  await P.see("Step 3 of 9");
  check("step 2 saves the date as yyyy-mm-dd", db.providerRows[0].date_of_birth === "1990-03-05", String(db.providerRows[0].date_of_birth));

  // step 3: Aadhaar
  await P.L("12-digit Aadhaar number").fill("234123412347");
  await P.waitBody("does not pass the check");
  check("a wrong Aadhaar number is flagged as you type", true);
  await P.T("Save and continue").click();
  await P.see("Look for a typo");
  check("a wrong Aadhaar number blocks the step", true);
  await P.L("12-digit Aadhaar number").fill("234123412346");
  await P.T("Save and continue").click();
  await P.see("front of your Aadhaar card");
  check("a good number still needs the photo of the card", true);
  await P.shot("61-kyc-step3");

  // coming back later resumes at the saved step
  await P.go("/provider");
  await P.see("Finish your verification");
  check("a half-finished application offers to continue", (await P.has("Continue verification")) && (await P.has("part-way")));
  await P.T("Continue verification").click();
  await P.see("Step 3 of 9");
  check("it reopens at the step where the pro stopped", true);

  // under review, then approved
  Object.assign(db.providerRows[0], { kyc_status: "pending" });
  await P.go("/provider/kyc");
  await P.see("Under review");
  check("a submitted application shows what happens next", (await P.has("1–2 working days")) && (await P.has("Check status again")));
  Object.assign(db.providerRows[0], { status: "active", kyc_status: "approved", kyc_reviewed_at: new Date(Date.now() - 10 * 86400000).toISOString(), total_jobs: 2 });

  // working hours
  await P.go("/provider/schedule");
  await P.see("Working hours");
  await P.see("No hours set yet");
  check("with no hours the pro is told customers can book 8 AM to 8 PM", await P.has("8 AM to 8 PM"));
  await pro.getByText("Add hours", { exact: true }).first().click(); // Monday's card is first
  await P.see("New hours");
  await P.T("Save hours").click();
  await P.waitBody("9:00 AM – 5:00 PM");
  const rows = db.tables.provider_availability || [];
  check("hours are saved for the day", rows.length === 1 && rows[0].day_of_week === "monday" && rows[0].start_time === "09:00" && rows[0].end_time === "17:00", JSON.stringify(rows));
  check("other days become days off once a schedule exists", await P.has("Day off"));
  await pro.getByText("Add hours", { exact: true }).first().click();
  await P.see("New hours");
  await P.T("Save hours").click();
  await P.see("overlaps another one");
  check("overlapping hours on the same day are refused", (db.tables.provider_availability || []).length === 1);
  await P.shot("62-schedule");

  // reviews
  await P.go("/provider/reviews");
  await P.see("No reviews yet");
  check("an empty reviews page explains where reviews come from", await P.has("real jobs done through HandyFix"));
  const pid = db.providerRows[0].id;
  (db.tables.reviews ??= []).push(
    { id: "r1", provider_id: pid, rating: 5, comment: "Fixed it fast.", reviewer_name: "Priya Sharma", service_name: "Plumbing", created_at: new Date().toISOString() },
    { id: "r2", provider_id: pid, rating: 4, comment: null, reviewer_name: "meera@example.com", service_name: null, created_at: new Date(Date.now() - 86400000).toISOString() },
  );
  await P.go("/provider/reviews");
  await P.see("2 reviews");
  check("the pro sees the average and each review", (await P.has("4.5")) && (await P.has("Fixed it fast.")));
  check("customers appear as first name and last initial, never an email", (await P.has("Priya S.")) && !(await P.has("meera@example.com")) && (await P.has("A customer")));
  await P.shot("63-reviews");

  // notifications
  (db.tables.provider_notifications ??= []).push({ id: "n1", provider_id: pid, type: "new_booking", title: "New request", message: "A customer wants a plumber.", booking_id: null, data: null, is_read: false, created_at: new Date().toISOString() });
  await P.go("/provider");
  await P.L("Notifications, 1 unread").waitFor({ state: "visible", timeout: 15000 });
  check("the bell shows how many are unread", true);
  await P.L("Notifications, 1 unread").click();
  await P.see("A customer wants a plumber.");
  check("the notification is listed as unread", await P.has("Mark all 1 as read"));
  await P.T("Mark all 1 as read").click();
  await P.waitBody("You are all caught up").catch(() => undefined);
  await sleep(500);
  check("marking all read updates the rows", (db.tables.provider_notifications || []).every((n) => n.is_read === true));
  await P.shot("64-notifications");

  // ════════════════════════ B. the customer ════════════════════════
  const cust = await open();
  const C = helpers(cust);
  await cust.goto(`${BASE}/`, { waitUntil: "networkidle" });
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
  await C.waitBody("What do you need fixed today?");
  const userId = db.users["meera@example.com"].id;
  db.verified.add(userId);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let seq = 0;
  const seed = (over = {}) => {
    const row = {
      id: "b-ft" + ++seq, provider_id: "p-asha", service_id: "s-plumb", customer_id: userId, status: "confirmed",
      created_at: new Date().toISOString(), booking_date: tomorrow, booking_time: "18:00:00", address: "12 MG Road",
      city: "Gandhinagar", pincode: "382010", special_instructions: "Kitchen tap leaks", sub_item_id: null, sub_item_name: null,
      provider_amount: 349, platform_fee: 0, total_amount: 349, latitude: 23.2156, longitude: 72.6369,
      provider_eta_minutes: null, cancellation_reason: null, ...over,
    };
    db.storedBookings.push(row);
    return row;
  };

  // chat
  const b1 = seed();
  await C.go(`/customer/booking/${b1.id}`);
  await C.see("Message Asha");
  check("once a pro accepts, the booking offers a chat", true);
  await C.T("Message Asha").click();
  await C.see("Chat with Asha");
  await C.waitBody("No messages yet", 10000).catch(() => undefined); // the list loads after the header
  check("a new chat explains it is empty", await C.has("No messages yet"));
  await C.L("Message").fill("Hello, I will be home at 6");
  await C.L("Send message").click();
  await C.waitBody("Hello, I will be home at 6");
  const sent = () => (db.tables.messages || []).filter((x) => x.booking_id === b1.id);
  check("a normal message is sent and shown", sent().length === 1 && sent()[0].sender_type === "customer" && sent()[0].sender_id === userId);
  const blockedTexts = ["call me on 98765 43210", "nine eight seven six five four three two one zero", "+91-9876543210"];
  for (const text of blockedTexts) {
    await C.L("Message").fill(text);
    await C.L("Send message").click();
    await C.waitBody("phone numbers cannot be shared in chat");
  }
  check("phone numbers (digits, words, +91) are refused with an explanation and never sent", sent().length === 1);
  await C.L("Message").fill("Price is Rs 1500, 2000 or 3000");
  await C.L("Send message").click();
  await C.waitBody("Price is Rs 1500, 2000 or 3000");
  check("a price list is not mistaken for a phone number", sent().length === 2);
  await C.shot("65-chat");

  // closed chat: completed booking keeps the history read-only
  const b2 = seed({ status: "completed", completed_at: new Date().toISOString() });
  (db.tables.messages ??= []).push({ id: "m-old", booking_id: b2.id, sender_id: "p-asha", sender_type: "provider", content: "All done!", is_read: true, created_at: new Date().toISOString() });
  await C.go(`/customer/chat/${b2.id}`);
  await C.see("This job has ended");
  check("after the job the chat is read-only, with the history", (await C.has("All done!")) && !(await C.L("Message").count().then((n) => n > 0)));

  // rating
  await C.go(`/customer/booking/${b2.id}`);
  await C.see("How was Asha?");
  check("a completed booking asks for a rating and offers Book again", (await C.has("Submit review")) && (await C.has("Book Asha again")));
  await C.L("5 stars").click();
  await C.waitBody("Excellent");
  await C.T("Submit review").click();
  await C.see("Your rating for Asha");
  const rv = (db.tables.reviews || []).find((r) => r.booking_id === b2.id);
  check("the rating is saved once, with the customer and pro", !!rv && rv.rating === 5 && rv.customer_id === userId && rv.provider_id === "p-asha", JSON.stringify(rv || {}));
  check("after rating, the form is gone", !(await C.has("Submit review")));
  await C.shot("66-rated");

  // late cancel warning (accepted, starts in about an hour)
  const soon = new Date(Date.now() + 3600000);
  const pad = (n) => String(n).padStart(2, "0");
  const b3 = seed({ booking_date: `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`, booking_time: `${pad(soon.getHours())}:${pad(soon.getMinutes())}:00` });
  await C.go(`/customer/booking/${b3.id}`);
  await C.T("Cancel booking").click();
  await C.see("late cancellation");
  check("cancelling soon after acceptance warns about the late-cancel rule", await C.has("3 late cancellations in 30 days"));
  await C.T("Yes, cancel it").click();
  await C.waitBody("Book again");
  const stored = db.storedBookings.find((r) => r.id === b3.id);
  check("the late cancellation is marked so it can be counted", stored.status === "cancelled" && stored.cancellation_reason === "Cancelled by customer (late)", String(stored.cancellation_reason));

  // the real error list
  const bad = errors.filter((e) => !/WebSocket/.test(e));
  check("no uncaught page errors", bad.length === 0, bad.join(" | ").slice(0, 400));

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
