// Phone-size screenshots of the main screens (mock backend) for design review: node e2e-web/preview.cjs customer|provider
const { chromium } = require("playwright");
const path = require("path");
const { installMock, installRealtime, db, BASE } = require("./mock-supabase.cjs");

const variant = process.argv[2] || "customer";
const OUT = path.join(__dirname, "shots", "preview", variant);
require("fs").mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(["geolocation"]);
  await ctx.setGeolocation({ latitude: 23.2156, longitude: 72.6369 });
  const page = await ctx.newPage();
  await installMock(page);
  await installRealtime(page);
  const T = (text, exact = true) => page.getByText(text, { exact }).locator("visible=true").last();
  const L = (label) => page.locator(`[aria-label="${label}"]:visible`).last();
  const shot = async (name, full = false) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: full }); console.log("shot", name); };

  // The app scrolls inside its own container, so a full-page shot is a series of scrolled shots.
  const scrollShots = async (prefix, steps = 7) => {
    for (let i = 1; i <= steps; i += 1) {
      const moved = await page.evaluate((dy) => {
        const els = [...document.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 40 && ["auto", "scroll"].includes(getComputedStyle(e).overflowY) && e.clientHeight > 300);
        const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (!el) return false;
        const before = el.scrollTop; el.scrollTop += dy; return el.scrollTop !== before;
      }, 720);
      if (!moved) break;
      await shot(`${prefix}-scroll${i}`);
    }
  };
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await T("Welcome back", false).waitFor({ state: "visible", timeout: 60000 });
  await shot("01-sign-in");
  await T("New here? Create an account").click();
  await L("Full name").waitFor();
  await shot("02-sign-up");
  await L("Full name").fill(variant === "provider" ? "Rajesh Kumar" : "Meera Shah");
  await L("Email").fill(`${variant}@example.com`);
  await L("Password").fill("secret123");
  await L("Confirm password").fill("secret123");
  await T("Create account").click();
  if (variant === "provider") {
    await T("Set up your pro account", false).waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
    await shot("03-pro-setup");
    await L("Mobile number").fill("98765 43211");
    await T("Continue").click();
    await T("Verify your identity to start", false).waitFor({ state: "visible", timeout: 20000 });
    Object.assign(db.providerRows[0], { status: "active", kyc_status: "approved", kyc_reviewed_at: new Date(Date.now() - 20 * 86400000).toISOString(), total_jobs: 4 });
    db.wallet = { available: 320, dues: 0 };
    await page.goto(`${BASE}/provider`, { waitUntil: "networkidle" });
    await shot("04-pro-home");
    await scrollShots("04-pro-home", 3);
  } else {
    await T("What do you need fixed today?", false).waitFor({ state: "visible", timeout: 30000 });
    await shot("03-home");
    await scrollShots("03-home", 2);
    db.verified.add(db.users["customer@example.com"].id);
    await page.goto(`${BASE}/customer`, { waitUntil: "networkidle" });
    await L("Plumbing").click();
    await T("What do you need?", false).waitFor({ state: "visible", timeout: 20000 });
    await shot("05-service");
    await T("Pipe leak").click();
    await T("Asha Patel", false).waitFor({ state: "visible", timeout: 20000 });
    await shot("06-pros");
    await scrollShots("06-pros", 1);
    await T("Book Asha").click();
    await T("Step 1 of 3", false).waitFor({ state: "visible", timeout: 20000 });
    await shot("07-book-1");
    await T("6:00 PM").click();
    await T("Continue").click();
    await T("Step 2 of 3", false).waitFor({ state: "visible", timeout: 20000 });
    await L("Address").fill("12 MG Road");
    await L("City").fill("Gandhinagar");
    await L("Pincode").fill("382010");
    await shot("08-book-2");
    await T("Continue").click();
    await T("Step 3 of 3", false).waitFor({ state: "visible", timeout: 20000 });
    await shot("09-book-3");
    await page.getByText("Confirm ·", { exact: false }).locator("visible=true").last().click();
    await T("Waiting for Asha", false).waitFor({ state: "visible", timeout: 20000 });
    await shot("10-waiting");
    const b = db.storedBookings[0];
    b.status = "on_the_way"; b.provider_eta_minutes = 12;
    db.locations = [{ booking_id: b.id, provider_id: "pro-user", latitude: 23.2256, longitude: 72.6369, updated_at: new Date().toISOString() }];
    await page.goto(`${BASE}/customer/booking/${b.id}`, { waitUntil: "networkidle" });
    await T("Arriving in about 12 min", false).waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
    await shot("11-on-the-way");
    await page.goto(`${BASE}/customer/bookings`, { waitUntil: "networkidle" });
    await shot("12-bookings");
    await page.goto(`${BASE}/customer/profile`, { waitUntil: "networkidle" });
    await shot("13-profile");
  }
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
