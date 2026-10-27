// The two store apps from one codebase. Needs the dev server started with EXPO_PUBLIC_APP_VARIANT=customer or provider:
//   node e2e-web/variant-flow.cjs customer   |   node e2e-web/variant-flow.cjs provider
const { chromium } = require("playwright");
const { installMock, installRealtime, db, BASE } = require("./mock-supabase.cjs");

const variant = process.argv[2];
if (variant !== "customer" && variant !== "provider") { console.error("usage: variant-flow.cjs customer|provider"); process.exit(2); }
const errors = [];
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|favicon/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
  await installMock(page);
  await installRealtime(page);
  const T = (text, exact = true) => page.getByText(text, { exact }).locator("visible=true").last();
  const L = (label) => page.locator(`[aria-label="${label}"]:visible`).last();
  const norm = (t) => t.replace(/\s+/g, " ").toLowerCase();
  const waitBody = (text, timeout = 20000) => page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").toLowerCase().includes(t), norm(text), { timeout });
  const has = async (t) => norm((await page.locator("body").innerText()).replace(/\s+/g, " ")).includes(norm(t));

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await T("Welcome back", false).waitFor({ state: "visible", timeout: 60000 });
  check("the sign-in copy matches the app", await has(variant === "provider" ? "receive and manage your jobs" : "book trusted pros"));
  await T("New here? Create an account").click();
  await L("Full name").fill("Test User");
  await L("Email").fill("t@example.com");
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await T("Create account").click();

  if (variant === "customer") {
    await waitBody("What do you need fixed today?");
    check("the customer app skips the role question and opens the home screen", !(await has("How will you use HandyFix?")) && (await has("Your Home, Fixed Fast")));
    const userId = db.users["t@example.com"].id;
    db.providerRows.push({ id: "p-x", user_id: userId, full_name: "Test User", status: "pending", kyc_status: "not_started", phone: "9876543210", email: "t@example.com", is_online: false });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await waitBody("This is a pro account");
    check("a pro who opens the customer app is told to use the Pro app (no broken screen)", (await has("Pros use the HandyFix Pro app")) && (await has("Sign out")));
  } else {
    await waitBody("Set up your pro account");
    check("the Pro app asks only for the pro details (no role choice)", !(await has("I need a service")) && !(await has("How will you use HandyFix?")) && (await has("Mobile number")));
    await L("Mobile number").fill("98765 43211");
    await T("Continue").click();
    await waitBody("Verify your identity to start");
    check("after setup a pro lands on the pro home", db.providerRows.length === 1 && (await has("PRO")));
  }

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", String(e).slice(0, 300)); console.error(errors.slice(0, 4).join("\n")); process.exit(2); });
