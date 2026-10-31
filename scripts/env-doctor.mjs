#!/usr/bin/env node
// Checks (and with --fix repairs) the local Supabase settings of every apnabanda app.
//
//   node scripts/env-doctor.mjs          check only, changes nothing
//   node scripts/env-doctor.mjs --fix    create or repair the missing .env.local files
//
// Why it exists: .env.local files are not tracked by git, so when apps moved folders
// (customer-app -> legacy/customer-app, admin-app -> apps/admin, new apps/mobile with new variable
// names) the old files were left behind and the apps lost their connection: no services, no pros.
// Only PUBLIC values are used (project URL + anon/publishable key). Never put a service key here.
// Existing files are never overwritten: a wrong value is reported, you decide.

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fix = process.argv.includes("--fix");

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const read = (p) => (existsSync(p) ? parseEnv(readFileSync(p, "utf8")) : null);

// The canonical project: the admin example file already carries the public URL and key.
const canonical = read(join(root, "apps/admin/.env.example")) ?? {};
const CANON_URL = canonical.VITE_SUPABASE_URL;
const CANON_KEY = canonical.VITE_SUPABASE_PUBLISHABLE_KEY;

const apps = [
  { name: "apps/admin (web admin)", dir: "apps/admin", url: "VITE_SUPABASE_URL", key: "VITE_SUPABASE_PUBLISHABLE_KEY", old: "admin-app" },
  { name: "apps/mobile (customer + pro)", dir: "apps/mobile", url: "EXPO_PUBLIC_SUPABASE_URL", key: "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", old: null },
];

async function countServices(url, key) {
  const base = url.replace(/\/+$/, "");
  const res = await fetch(`${base}/rest/v1/services?select=id&is_active=eq.true`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  const range = res.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : (await res.json()).length;
}

let problems = 0;
console.log(fix ? "apnabanda env doctor (fix mode)\n" : "apnabanda env doctor (check only; add --fix to repair)\n");
if (!CANON_URL || !CANON_KEY) {
  console.log("! apps/admin/.env.example has no project URL/key, so I cannot repair files automatically.\n");
}

for (const app of apps) {
  const file = join(root, app.dir, ".env.local");
  let values = read(file);
  const notes = [];

  if (!values && fix) {
    const oldFile = app.old ? join(root, app.old, ".env.local") : null;
    if (oldFile && existsSync(oldFile)) {
      copyFileSync(oldFile, file);
      notes.push(`copied your old settings from ${app.old}/.env.local`);
    } else if (CANON_URL && CANON_KEY) {
      writeFileSync(file, `${app.url}=${CANON_URL}\n${app.key}=${CANON_KEY}\n`);
      notes.push("created from the project in apps/admin/.env.example");
    }
    values = read(file);
  }

  // Mobile: the same public values under the old VITE_* names just need renaming.
  if (fix && values && app.dir === "apps/mobile" && (!values[app.url] || !values[app.key]) && values.VITE_SUPABASE_URL && values.VITE_SUPABASE_PUBLISHABLE_KEY) {
    const extra = `\n${app.url}=${values.VITE_SUPABASE_URL}\n${app.key}=${values.VITE_SUPABASE_PUBLISHABLE_KEY}\n`;
    writeFileSync(file, readFileSync(file, "utf8").replace(/\s*$/, "") + extra);
    notes.push("added the EXPO_PUBLIC_* names from your VITE_* values");
    values = read(file);
  }

  const url = values?.[app.url];
  const key = values?.[app.key];
  let status;

  if (!values) {
    status = "MISSING .env.local";
    problems++;
  } else if (!url || !key) {
    status = `INCOMPLETE: needs ${!url ? app.url : ""}${!url && !key ? " and " : ""}${!key ? app.key : ""}`;
    problems++;
    // Old variable names are a common cause on the mobile app.
    if (app.dir === "apps/mobile" && (values.VITE_SUPABASE_URL || values.NEXT_PUBLIC_SUPABASE_URL)) {
      notes.push("found VITE_* names: the mobile app needs EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    }
  } else {
    try {
      const n = await countServices(url, key);
      const host = new URL(url).host;
      if (n > 0) {
        status = `OK: ${n} services visible at ${host}`;
        if (CANON_URL && url.replace(/\/+$/, "") !== CANON_URL.replace(/\/+$/, "")) {
          notes.push(`this is NOT the project in apps/admin/.env.example (${new URL(CANON_URL).host}); fine if intended`);
        }
      } else {
        status = `PROBLEM: ${host} answers but has 0 active services (wrong or empty project?)`;
        problems++;
        if (CANON_URL && url !== CANON_URL) notes.push(`the apnabanda project is ${CANON_URL}`);
      }
    } catch (e) {
      status = `PROBLEM: cannot read services from ${url} (${e instanceof Error ? e.message : e})`;
      problems++;
    }
  }

  console.log(`- ${app.name}\n    ${status}`);
  for (const n of notes) console.log(`    note: ${n}`);
}

console.log(
  problems === 0
    ? "\nAll apps are connected and see services."
    : `\n${problems} app(s) need attention.${fix ? " Anything still listed was not fixable automatically." : " Run again with --fix to create missing files."}`,
);
console.log(
  "\nAfter changing settings: restart the dev server. For the mobile app use  npm run mobile:start -- --clear  (EXPO_PUBLIC_* values are baked in at build time).",
);
process.exit(problems === 0 ? 0 : 1);
