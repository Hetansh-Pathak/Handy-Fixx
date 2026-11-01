import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_NAME, APP_NAME_PRO, BRAND_COPY, brandCopy, brandServerText, PLATFORM_FEE_LABEL, SUPPORT_NAME } from "./brand";
import { LAUNCH_PERIOD } from "./money/launch";

const repo = resolve(__dirname, "../../..");

describe("brand constants", () => {
  it("name the product apnabanda", () => {
    expect(APP_NAME).toBe("apnabanda");
    expect(APP_NAME_PRO).toBe("apnabanda Pro");
    expect(SUPPORT_NAME).toBe("apnabanda");
    expect(PLATFORM_FEE_LABEL).toBe("apnabanda fee");
  });
  it("replaces the old name in server messages written before the rename", () => {
    expect(brandServerText("HandyFix has not set a price range for this job yet.")).toBe("apnabanda has not set a price range for this job yet.");
    expect(brandServerText("Open HandyFix Pro to see it")).toBe("Open apnabanda Pro to see it");
    expect(brandServerText("This KYC detail can only be saved by Handy Fix (x).")).toBe("This KYC detail can only be saved by apnabanda (x).");
    expect(brandServerText("Recharge ₹49 to accept.")).toBe("Recharge ₹49 to accept.");
  });
});

describe("opening screen and login poster copy", () => {
  it("has the agreed customer words", () => {
    expect(BRAND_COPY.customer).toMatchObject({ splashTagline: "Trusted pros. Lower prices.", splashPill: "Ghar ka kaam, sahi daam", posterPill: "Customer fee ₹0" });
    const h = BRAND_COPY.customer.posterHeadline;
    expect(h.before + h.accent + h.after).toBe("Your banda for every home job.");
    expect(h.accent).toBe("banda");
  });
  it("has the agreed Pro words, with the launch numbers read from LAUNCH_PERIOD (not typed)", () => {
    const p = BRAND_COPY.provider;
    expect(p.splashTagline).toBe("More jobs near you");
    expect(p.splashPill).toBeNull();
    expect(p.posterHeadline.before + p.posterHeadline.accent + p.posterHeadline.after).toBe("More jobs. Fair fee. Your area.");
    expect(p.posterSubline).toBe("Get requests near you. Pay a small fee only on completed jobs.");
    expect(p.posterPill).toBe(`First ${LAUNCH_PERIOD.jobs} jobs or 1 month fee-free`);
  });
  it("picks the copy by app variant; the dev build with both shows the customer copy", () => {
    expect(brandCopy("provider")).toBe(BRAND_COPY.provider);
    expect(brandCopy("customer")).toBe(BRAND_COPY.customer);
    expect(brandCopy("both")).toBe(BRAND_COPY.customer);
    expect(brandCopy(undefined)).toBe(BRAND_COPY.customer);
  });
  it("makes no promise the business model does not keep (no percent discounts, no delivery times)", () => {
    for (const c of Object.values(BRAND_COPY)) {
      const all = [c.splashTagline, c.splashPill ?? "", c.posterSubline, c.posterPill, c.posterHeadline.before, c.posterHeadline.accent, c.posterHeadline.after].join(" ");
      expect(all).not.toMatch(/%|\bminutes?\b|\bdiscount/i);
    }
  });
});

/**
 * The old name must not come back in anything a person can read. This scans the source (screens, strings, emails,
 * push wording, legal text, admin, the browser tests, the README) for the old name, after removing the technical
 * identifiers that must NOT change (package ids, URL schemes, the npm scope, storage and task keys, the support mailbox
 * and domain). Comment lines are ignored. Add to ALLOWED only for another technical identifier, never for wording.
 */
const ALLOWED: RegExp[] = [
  /@handyfix\/[a-z-]+/gi, // npm scope: @handyfix/shared, @handyfix/mobile, @handyfix/admin
  /\bcreateHandyFixClient\b/g, /\bHandyFixClient\w*/g, // exported identifiers
  /handyfix:\/\//gi, /\bhandyfixpro\b/g, // URL schemes
  /\bhandyfix_role\b/g, // auth user flag
  /\bin\.handyfix\.(app|pro)\b/g, // Android package ids: cannot change after the first Play Store upload
  /\bhandyfix[-_][a-z][a-z0-9_-]*/g, // storage keys, task names, project names
  /[\w.]*@handyfix\.in/gi, /https?:\/\/(www\.)?handyfix\.in[^\s"'`)<]*/gi, // the real support mailbox and domain until an apnabanda domain exists
  /\b(slug|scheme): "handyfix"/g, // Expo slug and URL scheme
  /^\s*handyfix\/\s*$/gm, // the folder name in the README tree
];
const SCAN = [
  "apps/mobile/src", "apps/mobile/e2e-web", "apps/mobile/app.config.ts", "apps/admin/src", "apps/admin/index.html",
  "packages/shared/src", "supabase/functions", "supabase/proposals/functions", "scripts", "README.md",
];
const SKIP_DIRS = new Set(["node_modules", "dist", ".expo", "shots", "out"]);
// brand.ts renames the old server text; the ledger test feeds it the old text on purpose.
const SKIP_FILES = new Set(["packages/shared/src/brand.ts", "packages/shared/src/brand.test.ts", "packages/shared/src/provider/wallet-ledger.test.ts"]);
const TEXT_FILE = /\.(tsx?|cjs|mjs|js|html|md)$/;

function collect(path: string, into: string[]): void {
  let st;
  try { st = statSync(path); } catch { return; }
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) if (!SKIP_DIRS.has(name)) collect(join(path, name), into);
  } else if (TEXT_FILE.test(path)) into.push(path);
}

describe("the old name is gone from user-facing text", () => {
  it("finds no HandyFix / Handy Fix / handy-fix outside the allowed technical identifiers", () => {
    const files: string[] = [];
    for (const p of SCAN) collect(join(repo, p), files);
    expect(files.length).toBeGreaterThan(200); // the scan really ran
    const hits: string[] = [];
    for (const file of files) {
      const rel = relative(repo, file).replace(/\\/g, "/");
      if (SKIP_FILES.has(rel)) continue;
      const markdown = rel.endsWith(".md");
      const lines = readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
      lines.forEach((line, i) => {
        const t = line.trim();
        if (/^(\/\/|\*|\/\*|\{\/\*)/.test(t) || (!markdown && t.startsWith("#"))) return;
        let s = line.replace(/\s\/\/.*$/, "");
        for (const re of ALLOWED) s = s.replace(re, " ");
        if (/handy[\s-]?fix/i.test(s)) hits.push(`${rel}:${i + 1}: ${t.slice(0, 120)}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("proves the scan would catch it", () => {
    const sample = 'label="HandyFix fee"';
    let s = sample;
    for (const re of ALLOWED) s = s.replace(re, " ");
    expect(/handy[\s-]?fix/i.test(s)).toBe(true);
    let tech = 'import x from "@handyfix/shared"; scheme: "handyfix", pkg: "in.handyfix.app"';
    for (const re of ALLOWED) tech = tech.replace(re, " ");
    expect(/handy[\s-]?fix/i.test(tech)).toBe(false);
  });
});
