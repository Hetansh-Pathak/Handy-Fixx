// Runs the REAL supabase/functions/razorpay-webhook/index.ts (not a copy) against a fake database client:
// forged / tampered / missing signatures, replayed events, wrong amounts, database errors, missing secret.
// The file is Deno code; the two Deno-only imports and the `serve` call are replaced by small stand-ins, nothing else is changed.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SECRET = "whsec_test_secret_value_1234567890";
type Handler = (req: Request) => Promise<Response>;
type Call = { fn: string; args: Record<string, unknown> };
type G = Record<string, unknown>;
const g = globalThis as unknown as G;

let handler: Handler;
const calls: Call[] = [];
const logs: { row: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
let rpcImpl: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { code?: string; message?: string } | null } = () => ({ data: { result: "credited" }, error: null });
let env: Record<string, string | undefined> = {};

before(async () => {
  const src = readFileSync(new URL("../../../functions/razorpay-webhook/index.ts", import.meta.url), "utf8")
    .replace(/\/\/ @ts-expect-error[^\n]*\nimport \{ serve \}[^\n]*\n/, "const serve = (h: unknown) => { (globalThis as Record<string, unknown>).__handler = h; };\n")
    .replace(/\/\/ @ts-expect-error[^\n]*\nimport \{ createClient \}[^\n]*\n/, "const createClient = (...a: unknown[]) => ((globalThis as Record<string, unknown>).__createClient as (...x: unknown[]) => unknown)(...a);\n");
  assert.ok(!src.includes("deno.land") && !src.includes("esm.sh"), "both Deno imports were replaced");
  const dir = mkdtempSync(join(tmpdir(), "hf-webhook-"));
  const file = join(dir, "razorpay-webhook.ts");
  writeFileSync(file, src);
  g.Deno = { env: { get: (n: string) => env[n] } };
  g.__createClient = () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return rpcImpl(fn, args); },
    from: () => ({ upsert: async (row: Record<string, unknown>, opts: Record<string, unknown>) => { logs.push({ row, opts }); return { error: null }; } }),
  });
  await import(pathToFileURL(file).href);
  handler = g.__handler as Handler;
  assert.equal(typeof handler, "function");
});

const reset = () => {
  calls.length = 0;
  logs.length = 0;
  env = { RAZORPAY_WEBHOOK_SECRET: SECRET, SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" };
  rpcImpl = () => ({ data: { result: "credited" }, error: null });
};
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("hex");
const post = (body: string, headers: Record<string, string> = {}) => handler(new Request("http://x/", { method: "POST", body, headers }));
const topup = (paymentId = "pay_1", amount = 10000) => JSON.stringify({
  event: "payment.captured",
  payload: { payment: { entity: { id: paymentId, order_id: "order_1", amount, method: "upi", notes: { type: "wallet_topup" } } } },
});

test("a request with no signature is refused and touches nothing", async () => {
  reset();
  const r = await post(topup());
  assert.equal(r.status, 401);
  assert.equal(calls.length, 0);
  assert.equal(logs.length, 0);
});

test("a signature made with another secret (forged) is refused", async () => {
  reset();
  const body = topup();
  const r = await post(body, { "x-razorpay-signature": sign(body, "attacker-secret") });
  assert.equal(r.status, 401);
  assert.equal(calls.length, 0);
});

test("a valid signature on a DIFFERENT body (tampered amount) is refused", async () => {
  reset();
  const signed = topup("pay_1", 100);
  const tampered = topup("pay_1", 1000000);
  const r = await post(tampered, { "x-razorpay-signature": sign(signed) });
  assert.equal(r.status, 401);
  assert.equal(calls.length, 0);
});

test("a signature of the wrong length, or not hex, is refused without an error", async () => {
  reset();
  for (const bad of ["abc", "", "z".repeat(64), sign(topup()) + "00"]) {
    const r = await post(topup(), { "x-razorpay-signature": bad });
    assert.equal(r.status, 401, bad.slice(0, 10));
  }
  assert.equal(calls.length, 0);
});

test("a correctly signed payment is recorded with exactly the order, payment and amount in the event", async () => {
  reset();
  const body = topup("pay_42", 19900);
  const r = await post(body, { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_1" });
  assert.equal(r.status, 200);
  assert.deepEqual(calls, [{ fn: "record_wallet_topup", args: { p_order_id: "order_1", p_payment_id: "pay_42", p_amount_paise: 19900 } }]);
  assert.equal(logs[0]?.row.event_id, "evt_1");
});

test("REPLAY: the same signed event delivered twice makes the same database call, which is idempotent; the log cannot be written twice", async () => {
  reset();
  const answers = ["credited", "duplicate"];
  rpcImpl = () => ({ data: { result: answers.shift() }, error: null });
  const body = topup("pay_7");
  const headers = { "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_replay" };
  const first = await (await post(body, headers)).json() as { result: string };
  const second = await (await post(body, headers)).json() as { result: string };
  assert.equal(first.result, "credited");
  assert.equal(second.result, "duplicate");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.ok(logs.every((l) => l.opts.onConflict === "event_id" && l.opts.ignoreDuplicates === true), "the event log ignores a repeated event id");
});

test("a wrong-amount payment is answered 200 'amount_mismatch' (the database refused to credit) and noted", async () => {
  reset();
  rpcImpl = () => ({ data: { result: "amount_mismatch", expected: 199, received: 49 }, error: null });
  const body = topup("pay_9", 4900);
  const r = await post(body, { "x-razorpay-signature": sign(body) });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { result: string }).result, "amount_mismatch");
  assert.match(String(logs[0]?.row.note), /mismatch/i);
});

test("a database error gives 500 so Razorpay retries (nothing is silently lost)", async () => {
  reset();
  rpcImpl = () => ({ data: null, error: { message: "connection reset" } });
  const body = topup();
  const r = await post(body, { "x-razorpay-signature": sign(body) });
  assert.equal(r.status, 500);
});

test("a booking payment is routed to the booking function, not the wallet", async () => {
  reset();
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_b", order_id: "order_b", amount: 50000, notes: { type: "booking_payment" } } } } });
  await post(body, { "x-razorpay-signature": sign(body) });
  assert.equal(calls[0]?.fn, "record_booking_payment");
  assert.deepEqual(calls[0]?.args, { p_order_id: "order_b", p_payment_id: "pay_b", p_amount_paise: 50000, p_method: null });
});

test("an unhandled note type is ignored, never credited", async () => {
  reset();
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: "o", amount: 100, notes: { type: "something_else" } } } } });
  const r = await post(body, { "x-razorpay-signature": sign(body) });
  assert.equal(((await r.json()) as { result: string }).result, "ignored");
  assert.equal(calls.length, 0);
});

test("a signed body that is not JSON gives 400, an unsigned GET is a harmless 200", async () => {
  reset();
  const body = "not json at all";
  assert.equal((await post(body, { "x-razorpay-signature": sign(body) })).status, 400);
  const get = await handler(new Request("http://x/", { method: "GET" }));
  assert.equal(get.status, 200);
  assert.equal(calls.length, 0);
});

test("without the webhook secret configured the function refuses everything (never 'open')", async () => {
  reset();
  env.RAZORPAY_WEBHOOK_SECRET = undefined;
  const body = topup();
  const r = await post(body, { "x-razorpay-signature": sign(body, "") });
  assert.equal(r.status, 500);
  assert.equal(calls.length, 0);
});
