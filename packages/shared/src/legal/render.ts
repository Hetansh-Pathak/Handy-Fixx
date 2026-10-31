import { APP_NAME } from "../brand";
import { accountDeletion } from "./deletion";
import { privacyPolicy } from "./privacy";
import { termsOfUse } from "./terms";
import type { LegalContext, LegalDoc, LegalDocKey } from "./types";

export function legalDoc(key: LegalDocKey, ctx: LegalContext): LegalDoc {
  return key === "privacy" ? privacyPolicy(ctx) : key === "terms" ? termsOfUse(ctx) : accountDeletion(ctx);
}

export const isLegalDocKey = (v: unknown): v is LegalDocKey => v === "privacy" || v === "terms" || v === "deletion";

/** Text that goes inside an HTML element or attribute: nothing in it can start a tag. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Wraps an email address in a mailto link, leaving all other text escaped and untouched. */
function withLinks(text: string, email: string): string {
  const safe = escapeHtml(text);
  const e = escapeHtml(email);
  return e ? safe.split(e).join(`<a href="mailto:${e}">${e}</a>`) : safe;
}

/** A complete, self-contained page (no scripts, no external files) that reads well on a phone, in light and dark. */
export function renderLegalHtml(doc: LegalDoc, ctx: LegalContext, nav: { key: LegalDocKey; title: string; href: string }[] = []): string {
  const sections = doc.sections
    .map((s) => `<section><h2>${escapeHtml(s.heading)}</h2>${s.body.map((p) => `<p>${withLinks(p, ctx.supportEmail)}</p>`).join("")}</section>`)
    .join("\n");
  const links = nav.length
    ? `<nav>${nav.map((n) => (n.key === doc.key ? `<span aria-current="page">${escapeHtml(n.title)}</span>` : `<a href="${escapeHtml(n.href)}">${escapeHtml(n.title)}</a>`)).join(" · ")}</nav>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} · ${APP_NAME}</title>
<meta name="description" content="${escapeHtml(doc.intro.slice(0, 150))}">
<style>
:root{color-scheme:light dark;--bg:#f6f8fc;--card:#fff;--fg:#0b1b3a;--muted:#45557a;--line:#e1e8f7;--brand:#1745c7}
@media (prefers-color-scheme:dark){:root{--bg:#05070d;--card:#0e1320;--fg:#f4f7ff;--muted:#a9b6d6;--line:#1f2a44;--brand:#a8c6ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:28px;line-height:1.2;margin:8px 0}
h2{font-size:18px;margin:0 0 8px}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:16px 0}
p{margin:8px 0}
a{color:var(--brand)}
nav{margin:8px 0 16px;color:var(--muted);font-size:14px}
.meta{color:var(--muted);font-size:14px}
</style>
</head>
<body>
<main>
${links}
<h1>${escapeHtml(doc.title)}</h1>
<p class="meta">Version ${escapeHtml(doc.version)} · Updated ${escapeHtml(doc.updated)}</p>
<p>${withLinks(doc.intro, ctx.supportEmail)}</p>
${sections}
</main>
</body>
</html>
`;
}
