// Runs the REAL handler code of send-provider-otp / verify-provider-otp / send-welcome-email (proposal 20261125) against
// in-memory fakes of the database and the mail sender. The fakes copy the SQL helpers' rules (attempt count, lock,
// single use, rate windows), which test-security.mjs checks on a real Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSendHandler, type SendDeps } from "../../../proposals/functions/send-provider-otp/handler.ts";
import { createVerifyHandler, type AttemptRow, type VerifyDeps } from "../../../proposals/functions/verify-provider-otp/handler.ts";
import { createWelcomeHandler, cleanDisplayName } from "../../../proposals/functions/send-welcome-email/handler.ts";
import { OTP_MAX_ATTEMPTS, randomOtp } from "../../../proposals/functions/_shared/otp.ts";
import { constantTimeEqual, hmacHex, secretBytes } from "../../../proposals/functions/_shared/crypto.ts";

const KEY = Buffer.alloc(32, 7).toString("base64");
const PRO = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";

type Row = { id: string; providerId: string; email: string; codeHash: string; salt: string; expiresAt: number; attempts: number; locked: boolean; consumed: boolean };

function world(opts: { key?: string | undefined } = {}) {
  let now = 1_800_000_000_000;
  const rows: Row[] = [];
  const events: { scope: string; key: string; at: number }[] = [];
  const sent: { to: string; code: string }[] = [];
  const verifiedEmail: { value: string | null; current: string } = { value: null, current: "" };
  let nextId = 1;
  const env = (n: string) => (n === "OTP_HMAC_KEY" ? ("key" in opts ? opts.key : KEY) : undefined);
  const getUserId = async (auth: string) => (auth === "Bearer pro" ? USER : auth === "Bearer other" ? OTHER : null);
  const ownsProvider = async (userId: string, providerId: string) => userId === USER && (providerId === PRO || providerId.startsWith("aaaaaaaa"));
  const rateTake = async (scope: string, keys: string[], windowSeconds: number, max: number) => {
    let wait = 0;
    for (const k of keys) {
      const inWin = events.filter((e) => e.scope === scope && e.key === k && e.at > now - windowSeconds * 1000);
      if (inWin.length >= max) wait = Math.max(wait, Math.ceil((Math.min(...inWin.map((e) => e.at)) + windowSeconds * 1000 - now) / 1000), 1);
    }
    if (wait) return wait;
    for (const k of keys) events.push({ scope, key: k, at: now });
    return 0;
  };
  const send: SendDeps = {
    env, getUserId, ownsProvider, rateTake, now: () => now,
    storeCode: async (r) => {
      verifiedEmail.current = r.email;
      verifiedEmail.value = null;
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.providerId === r.providerId && !rows[i]!.consumed) rows.splice(i, 1);
      rows.push({ id: String(nextId++), providerId: r.providerId, email: r.email, codeHash: r.codeHash, salt: r.salt,
        expiresAt: Date.parse(r.expiresAt), attempts: 0, locked: false, consumed: false });
    },
    sendEmail: async (to, code) => { sent.push({ to, code }); return true; },
  };
  const none: AttemptRow = { status: "none", otp_id: null, code_hash: null, salt: null, email: null, attempts_left: 0 };
  const verify: VerifyDeps = {
    env, getUserId, ownsProvider, rateTake,
    takeAttempt: async (providerId, max) => {
      const r = [...rows].reverse().find((x) => x.providerId === providerId);
      if (!r) return none;
      if (r.consumed) return { ...none, status: "used", otp_id: r.id };
      if (r.locked || r.attempts >= max) { r.locked = true; return { ...none, status: "locked", otp_id: r.id }; }
      if (r.expiresAt <= now) return { ...none, status: "expired", otp_id: r.id };
      r.attempts += 1;
      if (r.attempts >= max) r.locked = true;
      return { status: "ok", otp_id: r.id, code_hash: r.codeHash, salt: r.salt, email: r.email, attempts_left: max - r.attempts };
    },
    consume: async (id) => {
      const r = rows.find((x) => x.id === id);
      if (!r || r.consumed || r.expiresAt <= now) return false;
      r.consumed = true;
      return true;
    },
    markVerified: async (_p, email) => {
      if (email !== verifiedEmail.current) return false;
      verifiedEmail.value = email;
      return true;
    },
  };
  return {
    rows, sent, verifiedEmail,
    advance: (ms: number) => { now += ms; },
    sendOtp: (body: unknown, auth = "Bearer pro", ip = "10.0.0.1") => createSendHandler(send)(new Request("http://x/", {
      method: "POST", headers: { Authorization: auth, "x-forwarded-for": `${ip}, 172.16.0.1` }, body: JSON.stringify(body) })),
    verifyOtp: (body: unknown, auth = "Bearer pro", ip = "10.0.0.1") => createVerifyHandler(verify)(new Request("http://x/", {
      method: "POST", headers: { Authorization: auth, "x-forwarded-for": ip }, body: JSON.stringify(body) })),
  };
}

const body = async (r: Response) => ({ status: r.status, json: (await r.json()) as Record<string, unknown> });

test("send: stores only an HMAC with a salt, never the code", async () => {
  const w = world();
  const r = await body(await w.sendOtp({ provider_id: PRO, email: " Pro@Example.IN " }));
  assert.equal(r.status, 200);
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0]!.to, "pro@example.in");
  const row = w.rows[0]!;
  assert.match(row.codeHash, /^[0-9a-f]{64}$/);
  assert.match(row.salt, /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(row).includes(w.sent[0]!.code), "the plain code is not stored");
  assert.equal(row.expiresAt - 1_800_000_000_000, 10 * 60_000, "expires after 10 minutes");
});

test("send: two codes for the same input get different salts and hashes", async () => {
  const w = world();
  await w.sendOtp({ provider_id: PRO, email: "a@x.in" });
  const first = { ...w.rows[0]! };
  w.advance(61_000);
  await w.sendOtp({ provider_id: PRO, email: "a@x.in" });
  assert.equal(w.rows.length, 1, "older unused codes are removed");
  assert.notEqual(w.rows[0]!.salt, first.salt);
  assert.notEqual(w.rows[0]!.codeHash, first.codeHash);
});

test("send: needs a login and the pro's own provider row", async () => {
  const w = world();
  assert.equal((await w.sendOtp({ provider_id: PRO, email: "a@x.in" }, "")).status, 401);
  assert.equal((await w.sendOtp({ provider_id: PRO, email: "a@x.in" }, "Bearer other")).status, 403);
  assert.equal((await w.sendOtp({ provider_id: "nope", email: "a@x.in" })).status, 400);
  assert.equal((await w.sendOtp({ provider_id: PRO, email: "not-an-email" })).status, 400);
  assert.equal(w.sent.length, 0);
});

test("send: refuses to run without OTP_HMAC_KEY or with a short key", async () => {
  assert.equal((await world({ key: undefined }).sendOtp({ provider_id: PRO, email: "a@x.in" })).status, 500);
  assert.equal((await world({ key: Buffer.alloc(16, 1).toString("base64") }).sendOtp({ provider_id: PRO, email: "a@x.in" })).status, 500);
});

test("send: 1 a minute, 5 an hour per account, 20 an hour per IP", async () => {
  const w = world();
  assert.equal((await w.sendOtp({ provider_id: PRO, email: "a@x.in" })).status, 200);
  const soon = await body(await w.sendOtp({ provider_id: PRO, email: "a@x.in" }));
  assert.equal(soon.status, 429);
  assert.ok(Number(soon.json.retry_after) > 0 && Number(soon.json.retry_after) <= 60);
  for (let i = 0; i < 4; i++) { w.advance(61_000); assert.equal((await w.sendOtp({ provider_id: PRO, email: "a@x.in" })).status, 200); }
  w.advance(61_000);
  assert.equal((await w.sendOtp({ provider_id: PRO, email: "a@x.in" })).status, 429, "6th send in an hour is refused");
  w.advance(3_600_000);
  assert.equal((await w.sendOtp({ provider_id: PRO, email: "a@x.in" })).status, 200, "allowed again after the hour");

  // 25 different pro accounts behind one IP within the hour: the first 20 are sent, the rest refused.
  const ipw = world();
  const statuses: number[] = [];
  for (let i = 0; i < 25; i++) {
    const pid = `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, "0")}`;
    statuses.push((await ipw.sendOtp({ provider_id: pid, email: `a${i}@x.in` }, "Bearer pro", "9.9.9.9")).status);
  }
  assert.equal(statuses.filter((s) => s === 200).length, 20);
  assert.deepEqual(statuses.slice(20), [429, 429, 429, 429, 429]);
  assert.equal((await ipw.sendOtp({ provider_id: PRO, email: "z@x.in" }, "Bearer pro", "7.7.7.7")).status, 200, "another IP is not affected");
});

test("verify: right code works once; wrong codes count down; 5 wrong locks", async () => {
  const w = world();
  await w.sendOtp({ provider_id: PRO, email: "a@x.in" });
  const code = w.sent[0]!.code;
  const wrong = code === "000000" ? "111111" : "000000";
  const left: unknown[] = [];
  for (let i = 0; i < 4; i++) left.push((await body(await w.verifyOtp({ provider_id: PRO, otp_code: wrong }))).json.attempts_left);
  assert.deepEqual(left, [4, 3, 2, 1]);
  assert.equal((await w.verifyOtp({ provider_id: PRO, otp_code: code })).status, 200, "the 5th try may still be the right one");
  assert.equal(w.verifiedEmail.value, "a@x.in");
  assert.equal((await w.verifyOtp({ provider_id: PRO, otp_code: code })).status, 404, "single use");

  const l = world();
  await l.sendOtp({ provider_id: PRO, email: "a@x.in" });
  const c2 = l.sent[0]!.code;
  const bad = c2 === "000000" ? "111111" : "000000";
  for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await l.verifyOtp({ provider_id: PRO, otp_code: bad });
  assert.equal((await l.verifyOtp({ provider_id: PRO, otp_code: c2 })).status, 429, "locked even for the right code");
  assert.equal(l.verifiedEmail.value, null);
});

test("verify: expired code is refused", async () => {
  const w = world();
  await w.sendOtp({ provider_id: PRO, email: "a@x.in" });
  w.advance(10 * 60_000 + 1);
  assert.equal((await w.verifyOtp({ provider_id: PRO, otp_code: w.sent[0]!.code })).status, 410);
});

test("verify: a code sent to an old email does not verify a newer email", async () => {
  const w = world();
  await w.sendOtp({ provider_id: PRO, email: "a@x.in" });
  w.verifiedEmail.current = "changed@x.in"; // the pro changed their email after the code was sent
  assert.equal((await w.verifyOtp({ provider_id: PRO, otp_code: w.sent[0]!.code })).status, 409);
  assert.equal(w.verifiedEmail.value, null);
});

test("verify: needs a login and the pro's own row; 30 guesses an hour per IP", async () => {
  const w = world();
  await w.sendOtp({ provider_id: PRO, email: "a@x.in" });
  assert.equal((await w.verifyOtp({ provider_id: PRO, otp_code: "123456" }, "")).status, 401);
  assert.equal((await w.verifyOtp({ provider_id: PRO, otp_code: "123456" }, "Bearer other")).status, 403);
  assert.equal((await w.verifyOtp({ provider_id: PRO, otp_code: "12345" })).status, 400);
  const v = world();
  let limited = 0;
  for (let i = 0; i < 35; i++) if ((await v.verifyOtp({ provider_id: PRO, otp_code: "123456" }, "Bearer pro", "8.8.8.8")).status === 429) limited++;
  assert.equal(limited, 5, "guesses 31-35 from one IP are refused");
});

test("OTP codes are 6 digits and spread across the range", () => {
  const seen = new Set<string>();
  const firstDigits = new Array<number>(10).fill(0);
  for (let i = 0; i < 20_000; i++) {
    const c = randomOtp();
    assert.match(c, /^\d{6}$/);
    seen.add(c);
    firstDigits[Number(c[0])]! += 1;
  }
  assert.ok(seen.size > 19_000);
  for (const n of firstDigits) assert.ok(n > 1_600 && n < 2_400, `leading digit count ${n} is near 2000`);
});

test("crypto helpers: HMAC matches Node, compare, key length", async () => {
  const { createHmac } = await import("node:crypto");
  const key = secretBytes(KEY, "K");
  assert.equal(await hmacHex(key, "hello"), createHmac("sha256", Buffer.from(key)).update("hello").digest("hex"));
  assert.ok(constantTimeEqual("abc", "abc"));
  assert.ok(!constantTimeEqual("abc", "abd"));
  assert.ok(!constantTimeEqual("abc", "abcd"));
  assert.throws(() => secretBytes("", "K"));
  assert.throws(() => secretBytes(Buffer.alloc(31).toString("base64"), "K"));
  assert.equal(secretBytes("ab".repeat(32), "K").length, 32, "hex is accepted");
});

test("welcome email: only to the caller's own login email, name escaped, once a day", async () => {
  const mails: { to: string; nameHtml: string }[] = [];
  const events = new Map<string, number>();
  const handler = createWelcomeHandler({
    env: (n) => ({ OTP_HMAC_KEY: KEY, BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "s@x.in" } as Record<string, string>)[n],
    getUser: async (auth) => (auth === "Bearer u" ? { id: USER, email: "Me@X.in", name: null } : null),
    rateTake: async (scope, keys) => { const k = scope + keys.join(); const n = events.get(k) ?? 0; events.set(k, n + 1); return n >= 1 ? 3600 : 0; },
    send: async (to, nameHtml) => { mails.push({ to, nameHtml }); return true; },
  });
  const call = (auth: string, b: unknown) => handler(new Request("http://x/", { method: "POST", headers: { Authorization: auth }, body: JSON.stringify(b) }));
  assert.equal((await call("", { email: "victim@x.in" })).status, 401, "signed-out callers (anon key only) are refused");
  assert.equal((await call("Bearer u", { email: "victim@x.in", display_name: `<a href="http://evil">Click</a>` })).status, 200);
  assert.equal(mails.length, 1);
  assert.equal(mails[0]!.to, "me@x.in", "the body's email is ignored");
  assert.ok(!mails[0]!.nameHtml.includes("<"), "no HTML from the caller reaches the email");
  assert.equal((await call("Bearer u", { display_name: "Again" })).status, 200);
  assert.equal(mails.length, 1, "second welcome in a day is skipped");
  assert.equal(cleanDisplayName("  ", "ravi@x.in"), "ravi");
  assert.equal(cleanDisplayName("x".repeat(100), "a@b.c").length, 60);
});
