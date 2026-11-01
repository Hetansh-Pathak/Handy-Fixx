// The animated opening screen on the web build. Start the server WITH the splash on:
//   EXPO_PUBLIC_SKIP_SPLASH=0 node e2e-web/serve.cjs customer        (or provider)
//   node e2e-web/splash-flow.cjs customer                             (or provider)
// Checks it appears, plays, shows the final frame (wordmark, tagline, pill), stays dark in the Light theme, hands over to
// Sign in, and with reduced motion shows the final frame at once. Saves frames to docs/screens/splash-login/.
const { chromium } = require("playwright");
const path = require("path");
const { installMock, BASE } = require("./mock-supabase.cjs");

const variant = process.argv[2] === "provider" ? "provider" : "customer";
const pro = variant === "provider";
const TAGLINE = pro ? "More jobs near you" : "Trusted pros. Lower prices.";
const OUT = path.join(__dirname, "..", "..", "..", "docs", "screens", "splash-login");
require("fs").mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SPLASH = '[data-testid="animated-splash"]';

/** Waits until the text inside the splash is fully opaque (opacity of the element times its parents' is above 0.95). */
async function fullyShown(page, text, timeout = 5000) {
  await page.waitForFunction(({ sel, text }) => {
    const root = document.querySelector(sel);
    if (!root) return false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent || !n.textContent.includes(text)) continue;
      let o = 1;
      for (let el = n.parentElement; el && el !== root.parentElement; el = el.parentElement) o *= Number(getComputedStyle(el).opacity || 1);
      if (o > 0.95) return true;
    }
    return false;
  }, { sel: SPLASH, text }, { timeout, polling: 30 });
}

async function open(browser, { reduced = false, appearance = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  if (appearance) await page.addInitScript((a) => { try { localStorage.setItem("apnabanda.appearance", a); } catch { /* blocked */ } }, appearance);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installMock(page);
  page.goto(BASE + "/", { waitUntil: "commit" }).catch(() => undefined);
  await page.waitForSelector(SPLASH, { state: "visible", timeout: 90000 });
  // the clock starts when the splash is on screen; "at(ms)" waits until that many ms have passed since then
  const t0 = Date.now();
  const at = async (ms) => { const wait = ms - (Date.now() - t0); if (wait > 0) await sleep(wait); };
  return { ctx, page, errors, t0, at };
}

(async () => {
  const browser = await chromium.launch();

  // 1. normal motion, dark theme
  {
    const { ctx, page, errors, t0, at } = await open(browser);
    check(`the opening screen appears (${variant} app)`, true);
    await at(450);
    await page.screenshot({ path: path.join(OUT, `splash-${variant}-1-slap.png`) });
    await at(1050);
    await page.screenshot({ path: path.join(OUT, `splash-${variant}-2-wordmark.png`) });
    const earlyTag = await page.getByText(TAGLINE, { exact: true }).first().evaluate((el) => {
      let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity || 1); return o;
    }).catch(() => 0);
    check("at about 1.5 s the tagline has not shown yet (it fades up at 1.6 s)", earlyTag < 0.5, `opacity ${Math.round(earlyTag * 100) / 100}`);
    let tagShown = true, pillShown = true;
    await fullyShown(page, "apna", 4000).catch(() => { tagShown = false; });
    await fullyShown(page, TAGLINE, 4000).catch(() => { tagShown = false; });
    await fullyShown(page, pro ? "PRO" : "Ghar ka kaam, sahi daam", 4000).catch(() => { pillShown = false; });
    check("the wordmark and the tagline fade in", tagShown);
    check(pro ? "the Pro splash ends with the dark PRO pill" : "the customer splash ends with the frosted pill", pillShown);
    await page.waitForSelector(SPLASH, { state: "detached", timeout: 15000 }).catch(() => undefined);
    const goneAt = Date.now() - t0;
    check("it leaves by itself once the animation is done and the app is ready (about 2.5 s to 4 s after it mounts)", (await page.locator(SPLASH).count()) === 0 && goneAt >= 1800 && goneAt < 4500, `${goneAt} ms`);
    check("the Sign in screen is there when it leaves", (await page.getByText("Welcome back", { exact: false }).count()) >= 1);
    check("no uncaught page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
    await ctx.close();
  }

  // 2. the phone is in the LIGHT theme: the opening screen stays dark
  {
    const { ctx, page, at } = await open(browser, { appearance: "light" });
    await fullyShown(page, TAGLINE, 4000).catch(() => undefined);
    const bg = await page.evaluate((sel) => {
      const root = document.querySelector(sel);
      if (!root) return "none";
      let n = root.firstElementChild;
      while (n && getComputedStyle(n).backgroundColor === "rgba(0, 0, 0, 0)") n = n.firstElementChild;
      return n ? getComputedStyle(n).backgroundColor : "none";
    }, SPLASH);
    check("in the Light theme the opening screen is still the dark poster", /rgb\(5, 7, 13\)/.test(bg), bg);
    await page.screenshot({ path: path.join(OUT, `splash-${variant}-4-final-in-light-theme.png`) });
    await ctx.close();
  }

  // 3. reduced motion: the final frame at once, gone after about 600 ms
  {
    const { ctx, page, t0 } = await open(browser, { reduced: true });
    await page.getByText(TAGLINE, { exact: true }).first().waitFor({ state: "visible", timeout: 3000 }).catch(() => undefined);
    const tagAt = Date.now() - t0;
    check("reduced motion: the final frame is there at once", tagAt < 800, `${tagAt} ms`);
    await page.screenshot({ path: path.join(OUT, `splash-${variant}-5-reduced-motion.png`) });
    await page.waitForSelector(SPLASH, { state: "detached", timeout: 8000 }).catch(() => undefined);
    const goneAt = Date.now() - t0;
    check("reduced motion: it leaves after about 0.6 s (plus the 200 ms fade), well before the full 2.5 s", goneAt >= 150 && goneAt < 2000, `${goneAt} ms`);
    await ctx.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", String(e).slice(0, 300)); process.exit(2); });
