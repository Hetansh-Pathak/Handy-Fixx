// Drives the real app (React Native Web in Chromium) against a mocked Supabase HTTP API.
// Covers sign-up/in validation, role-pick, route guards, profile save, email OTP, one-role-per-account,
// forgot/reset password. See e2e-web/README.md for how to run it.
const BASE = process.env.E2E_BASE_URL || "http://localhost:8099";
const { chromium } = require("playwright");
const path = require("path");
const OUT = path.join(__dirname, "shots");
require("fs").mkdirSync(OUT, { recursive: true });

const { installMock, installRealtime, db, jwt, BASE: MOCK_BASE } = require("./mock-supabase.cjs");

const results = [];
let L;
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|favicon/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
  await installMock(page);
  await installRealtime(page); // the home screens now listen for notifications
  L = (n) => page.locator(`[aria-label="${n}"]:visible`).last();
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png") });
  const text = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Welcome back", { timeout: 60000 });
  check("signed-out user lands on Sign in", page.url().endsWith("/sign-in") || (await text()).includes("Welcome back"));
  await shot("01-sign-in");

  // sign-in validation
  await page.getByText("Sign in", { exact: true }).locator("visible=true").last().click();
  check("empty sign-in shows field errors", (await text()).includes("Enter a valid email") || (await text()).includes("Invalid email"), "");
  await shot("02-sign-in-errors");

  // wrong credentials -> friendly message from mocked backend
  await L("Email").fill("nobody@example.com");
  await L("Password").fill("wrongpass1");
  await page.getByText("Sign in", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Wrong email or password.", { timeout: 15000 }).then(() => check("wrong password shows friendly error", true)).catch(() => check("wrong password shows friendly error", false));

  // sign-up validation then success
  await page.getByText("New here? Create an account").last().click();
  await page.waitForSelector("text=Create your account");
  await L("Full name").fill("Asha Patel");
  await L("Email").fill("asha@example.com");
  await L("Password").fill("weakpass");
  await L("Confirm password").fill("different1");
  await page.getByText("Create account", { exact: true }).locator("visible=true").last().click();
  let t = await text();
  check("sign-up flags weak password and mismatch", t.includes("Include at least one number") && t.includes("Passwords do not match"));
  await shot("03-sign-up-errors");
  // The privacy policy and terms must be readable BEFORE signing in (store requirement), and offline, from inside the app.
  check("sign-up says that creating an account means agreeing to the Terms of Use and Privacy Policy",
    (await text()).includes("By creating an account you agree to our") && (await page.getByText("Terms of Use", { exact: true }).count()) >= 1 && (await page.getByText("Privacy Policy", { exact: true }).count()) >= 1);
  await page.getByText("Privacy Policy", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=1. What we collect", { timeout: 15000 });
  const policy = await text();
  check("the privacy policy opens in the app before signing in and describes the real data (Aadhaar, selfie, location, partners)",
    policy.includes("Version 1.0") && policy.includes("Aadhaar") && policy.includes("selfie") && policy.includes("Razorpay") && policy.includes("Delete account"), policy.slice(0, 200));
  await shot("03b-privacy-policy");
  await page.goBack();
  await page.waitForSelector("text=Create your account");
  await page.getByText("Terms of Use", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=1. What HandyFix is", { timeout: 15000 });
  check("the terms of use open in the app and state the price and cancellation rules", (await text()).includes("locked when you book") && (await text()).includes("stays open until a pro accepts"));
  await page.goBack();
  await page.waitForSelector("text=Create your account");
  await L("Full name").fill("Asha Patel");
  await L("Email").fill("asha@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await page.getByText("Create account", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=How will you use HandyFix?", { timeout: 20000 }).then(() => check("sign-up lands on role-pick (guard)", true)).catch(async () => check("sign-up lands on role-pick (guard)", false, (await text()).slice(0, 200)));
  await shot("04-role-pick");
  // Screen readers need to hear which choice is on: every radio must expose its checked state.
  const radios = await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].map((e) => e.getAttribute("aria-checked")));
  check("every radio button exposes its checked state to screen readers", radios.length >= 2 && radios.every((v) => v === "true" || v === "false"), JSON.stringify(radios));

  // role pick: provider w/o phone should block; then customer
  await page.getByText("I'm a pro").last().click();
  await page.getByText("Continue", { exact: true }).locator("visible=true").last().click();
  check("pro pick requires a valid mobile", (await text()).includes("Enter a valid 10-digit mobile number"));
  await shot("05-role-pick-pro-error");
  await page.getByText("I need a service").last().click();
  await page.getByText("Continue", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=What do you need fixed today?", { timeout: 20000 }).then(() => check("customer pick lands on customer home", true)).catch(async () => check("customer pick lands on customer home", false, (await text()).slice(0, 200)));
  check("home greets by first name", (await text()).includes("Hi, Asha"));
  await shot("06-customer-home");

  // profile + save + verification
  await page.getByText("Profile", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Verify your email");
  await shot("07-customer-profile");
  check("the profile is a menu with the real options only",
    (await text()).includes("Saved address") && (await text()).includes("Help & support") && (await text()).includes("Safety") && !(await text()).includes("Rewards"));
  await page.locator('[aria-label$=", edit profile"]:visible').last().click();
  await page.waitForSelector("text=Edit profile");
  await L("Mobile number").fill("12345");
  await L("Pincode").fill("12");
  await page.getByText("Save changes").last().click();
  t = await text();
  check("profile validates phone and pincode", t.includes("Enter a valid 10-digit mobile number") && t.includes("Enter a valid 6-digit pincode"));
  await L("Mobile number").fill("+91 98765 43210");
  await L("Address").fill("12 MG Road");
  await L("City").fill("Gandhinagar");
  await L("Pincode").fill("382010");
  await page.getByText("Save changes").last().click();
  await page.waitForSelector("text=Saved address", { timeout: 10000 })
    .then(() => check("profile saves (update→insert fallback) and returns to the menu", true))
    .catch(() => check("profile saves (update→insert fallback) and returns to the menu", false));
  check("saved profile has normalised phone", db.profiles[0]?.phone === "9876543210" && db.profiles[0]?.pincode === "382010", JSON.stringify(db.profiles[0] || {}));

  await page.getByText("Send code", { exact: true }).click();
  await page.waitForSelector("text=We sent a 6-digit code");
  await L("6-digit code").fill("000000");
  await page.getByText("Verify", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Invalid code", { timeout: 10000 }).then(() => check("wrong OTP shows server error", true)).catch(() => check("wrong OTP shows server error", false));
  await L("6-digit code").fill("123456");
  await page.getByText("Verify", { exact: true }).locator("visible=true").last().click();
  // Verified: the profile menu drops the verification card and ticks the email.
  await page.waitForFunction(() => !document.body.innerText.includes("Verify your email"), null, { timeout: 10000 })
    .then(() => check("correct OTP marks email verified", true)).catch(() => check("correct OTP marks email verified", false));
  await shot("08-profile-verified");

  // reload: session persists, goes straight to customer home
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=What do you need fixed today?", { timeout: 30000 }).then(() => check("session persists across reload", true)).catch(async () => check("session persists across reload", false, (await text()).slice(0, 160)));

  // sign out -> sign in screen
  await page.getByText("Profile", { exact: true }).locator("visible=true").last().click();
  await page.getByText("Sign out", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Welcome back", { timeout: 15000 }).then(() => check("sign out returns to sign in", true)).catch(() => check("sign out returns to sign in", false));

  // provider path with a fresh account
  await page.getByText("New here? Create an account").last().click();
  await L("Full name").fill("Rajesh Kumar");
  await L("Email").fill("rajesh@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await page.getByText("Create account", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=How will you use HandyFix?");
  await page.getByText("I'm a pro").last().click();
  await L("Mobile number").fill("98765 43211");
  await page.getByText("Continue", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Verify your identity to start", { timeout: 20000 }).then(() => check("pro pick creates provider row and lands on provider home", true)).catch(async () => check("pro pick creates provider row and lands on provider home", false, (await text()).slice(0, 200)));
  const row = db.providerRows[0];
  check("provider row is pending_approval / not_submitted with normalised phone", row?.status === "pending_approval" && row?.kyc_status === "not_submitted" && row?.phone === "9876543211", JSON.stringify(row || {}));
  await shot("09-provider-home");
  await page.getByText("Profile", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Identity check");
  await shot("10-provider-profile");

  // one role per account: customer with bookings cannot become a pro
  await page.getByText("Sign out", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Welcome back");
  await page.getByText("New here? Create an account").last().click();
  await L("Full name").fill("Meera Shah");
  await L("Email").fill("meera@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  db.bookings = 2;
  await page.getByText("Create account", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=How will you use HandyFix?");
  await page.getByText("I'm a pro").last().click();
  await L("Mobile number").fill("9876543212");
  await page.getByText("Continue", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=sign up with a different email").then(() => check("account with bookings cannot become a pro", true)).catch(() => check("account with bookings cannot become a pro", false));
  check("no provider row was created for that account", db.providerRows.length === 1);
  await shot("11-pro-blocked");

  // forgot password
  await page.getByText("Sign out", { exact: true }).locator("visible=true").last().click();
  await page.waitForSelector("text=Welcome back");
  await page.getByText("Forgot password?").last().click();
  await page.waitForSelector("text=Reset your password", { timeout: 10000 }).catch(async () => { console.log("DEBUG url:", page.url(), "body:", (await text()).slice(0, 200)); await shot("debug-forgot"); });
  await page.waitForTimeout(600);
  await L("Email").fill("asha@example.com");
  await page.getByText("Send reset link").last().click();
  await page.waitForSelector("text=reset link is on its way").then(() => check("forgot password confirms (no account enumeration)", true)).catch(() => check("forgot password confirms (no account enumeration)", false));
  await shot("12-forgot");

  // reset link: invalid and valid
  await page.goto(`${BASE}/reset-password#error=access_denied&error_description=Email+link+is+invalid+or+has+expired`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=expired").then(() => check("expired reset link is explained", true)).catch(() => check("expired reset link is explained", false, ""));
  const u = db.users["asha@example.com"];
  await page.goto("about:blank");
  await page.goto(`${BASE}/reset-password#access_token=${jwt(u.id, u.email)}&refresh_token=r-${u.id}&expires_in=3600&type=recovery`, { waitUntil: "networkidle" });
  await page.waitForSelector('[aria-label="New password"]', { state: "visible", timeout: 15000 }).then(() => check("valid recovery link opens the new-password form", true)).catch(async () => check("valid recovery link opens the new-password form", false, (await text()).slice(0, 200)));
  await L("New password").fill("brandnew99");
  await L("Confirm new password").fill("brandnew99");
  await page.getByText("Update password").last().click();
  await page.waitForSelector("text=Password updated").then(() => check("new password is saved", true)).catch(() => check("new password is saved", false));
  check("backend received the new password", db.users["asha@example.com"].password === "brandnew99");
  await shot("13-reset-done");

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
