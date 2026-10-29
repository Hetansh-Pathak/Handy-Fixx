import { describe, expect, it } from "vitest";
import { ALL_LEGAL_KEYS } from "./deletion";
import { escapeHtml, isLegalDocKey, legalDoc, renderLegalHtml } from "./render";
import { LEGAL_UPDATED, LEGAL_VERSION, type LegalContext } from "./types";

const ctx: LegalContext = { supportEmail: "support@handyfix.in" };
const docs = ALL_LEGAL_KEYS.map((k) => legalDoc(k, ctx));
const text = (d: ReturnType<typeof legalDoc>) => [d.intro, ...d.sections.flatMap((s) => [s.heading, ...s.body])].join("\n");

describe("legal documents", () => {
  it("has three documents with a version and a date", () => {
    expect(docs.map((d) => d.key)).toEqual(["privacy", "terms", "deletion"]);
    for (const d of docs) { expect(d.version).toBe(LEGAL_VERSION); expect(d.updated).toBe(LEGAL_UPDATED); expect(d.sections.length).toBeGreaterThanOrEqual(5); }
  });
  it("numbers its headings in order and never leaves a section empty", () => {
    for (const d of docs) d.sections.forEach((s, i) => { expect(s.heading.startsWith(`${i + 1}. `)).toBe(true); expect(s.body.length).toBeGreaterThan(0); s.body.forEach((p) => expect(p.trim().length).toBeGreaterThan(10)); });
  });
  it("contains no placeholder or unfinished text", () => {
    for (const d of docs) expect(text(d)).not.toMatch(/TODO|TBD|lorem|\[[^\]]*(name|address|city)[^\]]*\]|XXX|undefined|null/i);
  });
  it("always gives a way to reach us and a grievance contact", () => {
    for (const d of docs) { expect(text(d)).toContain("support@handyfix.in"); expect(text(d)).toContain("Grievance officer"); }
  });
  it("leaves out company details that were not supplied, and includes them when they are", () => {
    expect(text(legalDoc("privacy", ctx))).not.toContain("Address:");
    const full = text(legalDoc("privacy", { ...ctx, entityName: "Acme Services Pvt Ltd", address: "1 MG Road, Gandhinagar", grievanceOfficer: "Asha Patel" }));
    expect(full).toContain("Acme Services Pvt Ltd");
    expect(full).toContain("Address: 1 MG Road, Gandhinagar");
    expect(full).toContain("Grievance officer: Asha Patel");
  });
});

describe("what the documents say matches how the apps work", () => {
  const privacy = text(legalDoc("privacy", ctx));
  it("privacy: names the data the apps really collect", () => {
    for (const w of ["Aadhaar", "PAN", "selfie", "voice note", "UPI", "about 1 km", "background location", "Supabase", "Razorpay", "Google", "Expo"]) expect(privacy).toContain(w);
  });
  it("privacy: says we do not sell data, that the full address and phone come only after acceptance, and that adults only may use it", () => {
    expect(privacy).toContain("do not sell");
    expect(privacy).toContain("only after the pro accepts");
    expect(privacy).toContain("18 or older");
  });
  const terms = text(legalDoc("terms", ctx));
  it("terms: matches the business rules", () => {
    for (const w of ["locked when you book", "no fee for customers", "pay the pro directly", "4-digit code", "24 hours", "48 hours", "3 late cancellations in 30 days", "stays open until a pro accepts", "laws of India", "Partner Agreement"]) expect(terms.toLowerCase()).toContain(w.toLowerCase());
  });
  const deletion = text(legalDoc("deletion", ctx));
  it("deletion: says how, what is erased and what is kept", () => {
    for (const w of ["Profile", "Delete account", "Delete my HandyFix account", "15 days", "Aadhaar", "What we keep"]) expect(deletion.toLowerCase()).toContain(w.toLowerCase());
  });
});

describe("HTML rendering", () => {
  it("escapes everything that could start a tag", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'q'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;");
    const evil = renderLegalHtml(legalDoc("privacy", { supportEmail: "a@b.in", entityName: "<img src=x onerror=alert(1)>" }), { supportEmail: "a@b.in", entityName: "<img src=x onerror=alert(1)>" });
    expect(evil).not.toContain("<img");
    expect(evil).toContain("&lt;img");
  });
  it("makes a complete page that works on phones and in dark mode, with no scripts", () => {
    const html = renderLegalHtml(legalDoc("privacy", ctx), ctx, [{ key: "privacy", title: "Privacy Policy", href: "privacy.html" }, { key: "terms", title: "Terms of Use", href: "terms.html" }]);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('name="viewport"');
    expect(html).toContain("prefers-color-scheme:dark");
    expect(html).toContain("<title>Privacy Policy · HandyFix</title>");
    expect(html).toContain('<a href="terms.html">Terms of Use</a>');
    expect(html).toContain('<span aria-current="page">Privacy Policy</span>');
    expect(html).toContain('<a href="mailto:support@handyfix.in">support@handyfix.in</a>');
    expect(html).not.toMatch(/<script/i);
  });
  it("recognises document keys", () => {
    expect(isLegalDocKey("privacy") && isLegalDocKey("terms") && isLegalDocKey("deletion")).toBe(true);
    for (const v of ["x", "", null, undefined, 3, "../etc"]) expect(isLegalDocKey(v)).toBe(false);
  });
});
