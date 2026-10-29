// Builds the public web pages (privacy policy, terms of use, account deletion) into site/ from the SAME text the apps show
// (packages/shared/src/legal). Run from the main folder:  npm run legal:build
// Company details are optional and read from the environment; anything left empty is simply left out of the text:
//   LEGAL_SUPPORT_EMAIL  LEGAL_ENTITY  LEGAL_ADDRESS  LEGAL_GRIEVANCE_OFFICER
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = await build({
  entryPoints: [resolve(root, "packages/shared/src/legal/index.ts")],
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "error",
});
const code = bundled.outputFiles[0].text;
const legal = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

const ctx = {
  supportEmail: process.env.LEGAL_SUPPORT_EMAIL || "support@handyfix.in",
  entityName: process.env.LEGAL_ENTITY || undefined,
  address: process.env.LEGAL_ADDRESS || undefined,
  grievanceOfficer: process.env.LEGAL_GRIEVANCE_OFFICER || undefined,
};

const files = { privacy: "privacy.html", terms: "terms.html", deletion: "account-deletion.html" };
const docs = ["privacy", "terms", "deletion"].map((key) => legal.legalDoc(key, ctx));
const nav = docs.map((d) => ({ key: d.key, title: d.title, href: files[d.key] }));

const out = resolve(root, "site");
await mkdir(out, { recursive: true });
for (const d of docs) await writeFile(resolve(out, files[d.key]), legal.renderLegalHtml(d, ctx, nav), "utf8");

const e = legal.escapeHtml;
await writeFile(resolve(out, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>HandyFix</title>
<style>:root{color-scheme:light dark}body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:32px 16px}a{color:#1745c7}@media (prefers-color-scheme:dark){body{background:#05070d;color:#f4f7ff}a{color:#a8c6ff}}</style></head>
<body><h1>HandyFix</h1><p>Verified home-service professionals in your city.</p><ul>
${docs.map((d) => `<li><a href="${files[d.key]}">${e(d.title)}</a></li>`).join("\n")}
</ul><p>Questions: <a href="mailto:${e(ctx.supportEmail)}">${e(ctx.supportEmail)}</a></p></body></html>
`, "utf8");

console.log(`Wrote ${docs.length + 1} pages to site/ (privacy.html, terms.html, account-deletion.html, index.html)`);
