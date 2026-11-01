// The apnabanda look for every email the Edge Functions send (owner decision 2026-11-01: name apnabanda; look "Black + Blur"
// header over a "Blue + White" card, the same colours as the app: src/theme/palettes.ts). One layout, so the three mails
// (customer code, pro code, welcome) cannot drift apart.
//
// IDENTICAL COPY in supabase/functions/_shared/email-theme.ts (a test fails if they differ). Pure strings, no imports,
// so it runs in Deno and in Vitest. Every value a caller passes into `bodyHtml` must already be escaped (escapeHtml).
//
// Email clients ignore most CSS, so this is old-style table HTML with inline styles. It reads well in light mode, and
// the `prefers-color-scheme: dark` block (Apple Mail, Gmail app) switches the card to the dark theme.

export const EMAIL_BRAND = {
  name: "apnabanda",
  /** "apna" in white, "banda" in hard-hat amber, like the app logo. */
  wordmark: ["apna", "banda"] as const,
  year: 2026,
} as const;

const C = {
  canvas: "#F3F7FF",
  card: "#FFFFFF",
  fg: "#0B1B3A",
  muted: "#566684",
  line: "#E1E8F7",
  brand: "#1F5BFF",
  tint: "#E6EEFF",
  tintFg: "#1745C7",
  accent: "#FFB703",
  onAccent: "#1A1100",
  heroA: "#05070D",
  heroB: "#0B1B3A",
} as const;

const FONT = "'Plus Jakarta Sans','Segoe UI',Roboto,Arial,sans-serif";

export type EmailLayout = {
  /** <title> and the grey preview line most inboxes show next to the subject. */
  title: string;
  preheader?: string;
  /** The big line in the card (plain text; it is escaped here). */
  heading: string;
  /** Paragraphs, the code box and so on. Already-escaped HTML. */
  bodyHtml: string;
  /** The Pro app shows an amber PRO pill next to the name. */
  app?: "customer" | "provider";
  /** The grey line under the wordmark. */
  tagline?: string;
};

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A paragraph in the body text style. `html` must already be escaped. */
export const emailParagraph = (html: string): string =>
  `<p class="ab-muted" style="margin:0 0 16px;color:${C.muted};font-size:15px;line-height:1.7">${html}</p>`;

/** The one-time code: big, spaced, in the brand blue on a soft blue tile. `code` must be digits only. */
export function emailCodeBox(code: string): string {
  const safe = code.replace(/[^0-9]/g, "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td class="ab-code" align="center" style="padding:20px 12px;border-radius:14px;background:${C.tint};border:1px solid ${C.line};color:${C.tintFg};font-family:Consolas,'Courier New',monospace;font-size:36px;font-weight:800;letter-spacing:10px">${safe}</td></tr></table>`;
}

/** A small "label: value" line (the welcome mail shows the email address this way). Both arguments already escaped. */
export const emailFact = (label: string, valueHtml: string): string =>
  `<p class="ab-muted" style="margin:0 0 6px;color:${C.muted};font-size:14px">${label}: <strong class="ab-fg" style="color:${C.fg}">${valueHtml}</strong></p>`;

/** Three short promises under the welcome text, same wording as the app's poster. */
export function emailPromises(items: readonly (readonly [string, string])[]): string {
  const rows = items
    .map(
      ([title, sub]) =>
        `<tr><td class="ab-tile" style="padding:12px 14px;border-radius:12px;background:${C.tint};border:1px solid ${C.line}"><span class="ab-fg" style="display:block;color:${C.fg};font-size:14px;font-weight:700">${escapeText(title)}</span><span class="ab-muted" style="display:block;margin-top:2px;color:${C.muted};font-size:13px">${escapeText(sub)}</span></td></tr><tr><td style="height:8px;line-height:8px;font-size:0">&nbsp;</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 12px">${rows}</table>`;
}

export function emailLayout(opts: EmailLayout): string {
  const [apna, banda] = EMAIL_BRAND.wordmark;
  const pro =
    opts.app === "provider"
      ? `<span style="display:inline-block;vertical-align:middle;margin-left:10px;padding:3px 10px;border-radius:999px;background:${C.accent};color:${C.onAccent};font-size:12px;font-weight:800;letter-spacing:1px">PRO</span>`
      : "";
  const tagline = opts.tagline
    ? `<p style="margin:10px 0 0;color:#B8C4DE;font-size:14px;line-height:1.5">${escapeText(opts.tagline)}</p>`
    : "";
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeText(opts.preheader)}</div>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" /><meta name="supported-color-schemes" content="light dark" />
<title>${escapeText(opts.title)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .ab-page { background:#05070D !important; }
  .ab-card { background:#0F1730 !important; border-color:#1E2A4A !important; }
  .ab-fg { color:#F2F6FF !important; }
  .ab-muted { color:#A9B6D3 !important; }
  .ab-code, .ab-tile { background:#16224A !important; border-color:#24335F !important; color:#9DBBFF !important; }
  .ab-foot { color:#7F8DAE !important; border-color:#1E2A4A !important; }
}
@media only screen and (max-width:480px) { .ab-pad { padding:24px 20px !important; } }
</style></head>
<body class="ab-page" style="margin:0;padding:0;background:${C.canvas};font-family:${FONT}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ab-page" style="background:${C.canvas}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ab-card" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:20px;overflow:hidden">
<tr><td bgcolor="${C.heroA}" align="center" style="padding:34px 28px;background:${C.heroA};background-image:linear-gradient(135deg,${C.heroA},${C.heroB})">
<div style="font-size:30px;font-weight:800;letter-spacing:-0.5px;line-height:1.2"><span style="color:#FFFFFF">${escapeText(apna)}</span><span style="color:${C.accent}">${escapeText(banda)}</span>${pro}</div>${tagline}
</td></tr>
<tr><td class="ab-pad" style="padding:32px 32px 8px">
<h1 class="ab-fg" style="margin:0 0 14px;color:${C.fg};font-size:22px;line-height:1.3;font-weight:800">${escapeText(opts.heading)}</h1>
${opts.bodyHtml}
</td></tr>
<tr><td class="ab-foot ab-pad" style="padding:20px 32px 28px;border-top:1px solid ${C.line};color:${C.muted};font-size:12px;line-height:1.6;text-align:center">&copy; ${EMAIL_BRAND.year} ${EMAIL_BRAND.name}. If this was not you, ignore this email or reply to tell us.</td></tr>
</table></td></tr></table></body></html>`;
}
