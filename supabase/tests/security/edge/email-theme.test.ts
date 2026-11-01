// The apnabanda email look (owner request 2026-11-02): the three mails the Edge Functions send must carry the new name and
// theme, never the old HandyFix wording or the old black-and-gold card, and must stay safe against HTML in names / addresses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emailCodeBox, emailFact, emailLayout, emailParagraph, emailPromises, escapeText } from "../../../proposals/functions/_shared/email-theme.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const sample = (app: "customer" | "provider") =>
  emailLayout({
    title: "Your apnabanda verification code",
    preheader: "Your code is 817339.",
    heading: "Verify your email",
    app,
    tagline: "Verified, rated, and at a fixed price.",
    bodyHtml: emailParagraph("Use this code.") + emailCodeBox("817339") + emailFact("Email", "a@b.in"),
  });

test("the layout carries the apnabanda name and the new theme, not the old one", () => {
  const html = sample("customer");
  assert.match(html, /apna<\/span><span[^>]*>banda/);
  assert.ok(html.includes("#1F5BFF") || html.includes("#1745C7"), "brand blue is used");
  assert.ok(html.includes("#FFB703"), "hard-hat amber is used for 'banda'");
  assert.ok(html.includes("prefers-color-scheme: dark"), "has a dark-mode block");
  assert.doesNotMatch(html, /handy\s?fix/i);
  assert.ok(!html.includes("#d4a017") && !html.includes("#f5c842") && !html.includes("#0f0f0f"), "old gold/black card colours are gone");
  assert.ok(!html.includes("Marketplace"));
});

test("only the Pro mail shows the PRO pill", () => {
  assert.ok(sample("provider").includes(">PRO<"));
  assert.ok(!sample("customer").includes(">PRO<"));
});

test("the code box keeps digits only", () => {
  assert.ok(emailCodeBox("12<script>34").includes(">1234<"));
  assert.ok(!emailCodeBox("12<script>34").includes("<script>"));
});

test("text is escaped in the heading, title, tagline and promises", () => {
  const html = emailLayout({ title: "<b>t</b>", heading: "<img src=x onerror=1>", bodyHtml: emailPromises([["<i>a</i>", "<u>b</u>"]]), tagline: "<s>x</s>" });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<i>a</i>") && !html.includes("<u>b</u>") && !html.includes("<s>x</s>"));
  assert.equal(escapeText(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});

test("both copies of the template are identical (functions/ and proposals/functions/)", () => {
  assert.equal(
    read("../../../functions/_shared/email-theme.ts"),
    read("../../../proposals/functions/_shared/email-theme.ts"),
  );
});

test("the three mail functions use the shared template and carry no old wording", () => {
  for (const p of [
    "../../../functions/send-customer-otp/index.ts",
    "../../../proposals/functions/send-provider-otp/index.ts",
    "../../../proposals/functions/send-welcome-email/index.ts",
  ]) {
    const src = read(p);
    assert.match(src, /email-theme\.ts/, `${p} imports the shared template`);
    assert.match(src, /emailLayout\(/, `${p} builds the mail with emailLayout`);
    assert.doesNotMatch(src, /handy\s?fix/i, `${p} has no old name`);
    assert.ok(!src.includes("#d4a017") && !src.includes("Marketplace"), `${p} has no old theme`);
  }
});
