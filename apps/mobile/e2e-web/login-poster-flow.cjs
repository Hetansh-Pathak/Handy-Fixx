// The sign-in poster ("Black + Blur sticker collage"). Needs the normal e2e server of that app:
//   node e2e-web/serve.cjs customer     (or provider)
//   node e2e-web/login-poster-flow.cjs customer
// Checks the words, that the poster is dark in the Light theme too, that the form is still there and reachable on a small phone
// (360 x 640) and with a keyboard-sized window, and saves frames to docs/screens/splash-login/.
const { chromium } = require("playwright");
const path = require("path");
const { installMock, BASE } = require("./mock-supabase.cjs");

const variant = process.argv[2] === "provider" ? "provider" : "customer";
const pro = variant === "provider";
const HEADLINE = pro ? "More jobs. Fair fee. Your area." : "Your banda for every home job.";
const SUBLINE = pro ? "Get requests near you. Pay a small fee only on completed jobs." : "Verified, rated, and at a fixed price.";
const PILL = pro ? "First 10 jobs or 1 month fee-free" : "Customer fee ₹0";
const OUT = path.join(__dirname, "..", "..", "..", "docs", "screens", "splash-login");
require("fs").mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, { width = 390, height = 844, appearance = "dark", reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.addInitScript((a) => { try { localStorage.setItem("apnabanda.appearance", a); } catch { /* blocked */ } }, appearance);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installMock(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.getByText("Welcome back", { exact: false }).first().waitFor({ state: "visible", timeout: 90000 });
  await sleep(900); // the stickers finish popping in
  return { ctx, page, errors };
}
const inViewport = (page, locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0;
});

(async () => {
  const browser = await chromium.launch();

  // 1. Dark theme, a normal phone
  {
    const { ctx, page, errors } = await open(browser, { appearance: "dark" });
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    check("the poster headline, sub line and fee pill are shown", body.includes(HEADLINE) && body.includes(SUBLINE) && body.includes(PILL), body.slice(0, 160));
    check("the form is still there: Welcome back, Email, Password, Sign in, Google, Create an account",
      ["Welcome back", "Email", "Password", "Sign in", "Continue with Google", "New here? Create an account"].every((t) => body.includes(t)));
    check("no old copy: no percent discounts or delivery times on the poster", !/%|\bminutes?\b|discount/i.test(HEADLINE + SUBLINE + PILL));
    await page.screenshot({ path: path.join(OUT, `login-${variant}-dark.png`), fullPage: false });
    check("no uncaught page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
    await ctx.close();
  }

  // 2. Light theme: the poster stays dark, the form follows Light
  {
    const { ctx, page } = await open(browser, { appearance: "light" });
    const bg = await page.evaluate((text) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent || !n.textContent.includes(text)) continue;
        for (let el = n.parentElement; el; el = el.parentElement) {
          const c = getComputedStyle(el).backgroundColor;
          if (c !== "rgba(0, 0, 0, 0)") return c;
        }
      }
      return "none";
    }, SUBLINE.slice(0, 14));
    check("in the Light theme the poster is still the dark brand poster", /rgb\(5, 7, 13\)/.test(bg), bg);
    const formBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check("...and the page behind the form follows the Light theme", /rgb\(243, 247, 255\)/.test(formBg), formBg);
    await page.screenshot({ path: path.join(OUT, `login-${variant}-light.png`), fullPage: false });
    await ctx.close();
  }

  // 3. a small phone, 360 x 640: the poster scrolls away, the form is reachable
  {
    const { ctx, page } = await open(browser, { width: 360, height: 640, appearance: "dark" });
    await page.screenshot({ path: path.join(OUT, `login-${variant}-360x640.png`) });
    const signIn = page.getByRole("button", { name: "Sign in", exact: true }).first();
    await signIn.scrollIntoViewIfNeeded();
    check("360 x 640: the Sign in button can be scrolled into view and is at least 44 px tall", (await inViewport(page, signIn)) && (await signIn.evaluate((el) => el.getBoundingClientRect().height)) >= 44);
    await page.screenshot({ path: path.join(OUT, `login-${variant}-360x640-scrolled.png`) });
    await ctx.close();
  }

  // 4. a keyboard is open: the window is only ~330 px tall (360 x 640 minus a 310 px keyboard)
  {
    const { ctx, page } = await open(browser, { width: 360, height: 330, appearance: "dark" });
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    check("with a keyboard-sized window the poster shrinks (no collage, no sub line, no pill)", !body.includes(PILL) && !body.includes(SUBLINE) && body.includes(HEADLINE.split(".")[0]), body.slice(0, 140));
    const email = page.getByLabel("Email").first();
    await email.click();
    check("the Email field is visible above the keyboard", await inViewport(page, email));
    const signIn = page.getByRole("button", { name: "Sign in", exact: true }).first();
    await signIn.scrollIntoViewIfNeeded();
    check("the Sign in button can be reached while the keyboard is open", await inViewport(page, signIn));
    await page.screenshot({ path: path.join(OUT, `login-${variant}-360-keyboard.png`) });
    await ctx.close();
  }

  // 5. reduced motion: the stickers are simply there
  {
    const { ctx, page } = await open(browser, { reduced: true });
    await page.screenshot({ path: path.join(OUT, `login-${variant}-reduced-motion.png`) });
    check("reduced motion: the poster is complete at once", (await page.locator("body").innerText()).includes(PILL));
    await ctx.close();
  }

  // 6. the other forms get the compact poster and keep working
  {
    const { ctx, page } = await open(browser, { width: 390, height: 844 });
    await page.getByText("New here? Create an account").first().click();
    await page.getByText("Create your account", { exact: false }).first().waitFor({ state: "visible", timeout: 20000 });
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    check("Create account has the compact poster (headline only) and its form", body.includes(HEADLINE.split(".")[0]) && !body.includes(PILL) && body.includes("Full name") && body.includes("Confirm password"));
    await page.screenshot({ path: path.join(OUT, `signup-${variant}-compact.png`) });
    await ctx.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", String(e).slice(0, 300)); process.exit(2); });
