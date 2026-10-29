import { build } from "esbuild";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the REAL supabase/proposals/functions/notify-push/index.ts with fake Deno, fake database and fake Expo.
const FUNCTION_DIR = resolve(__dirname, "../../../../supabase/proposals/functions/notify-push");
const B = "7f3c1a52-1111-4222-8333-abcdefabcdef";
const TOKEN = "ExponentPushToken[abcdefghij1234567890]";

type Db = {
  providers: Record<string, string>; tokens: { token: string; user_id: string; role: string }[]; log: Set<string>;
  deleted: string[]; failProviderLookup: boolean; failLogWith: string | null;
};
let db: Db;
let sent: { url: string; body: any[]; headers: Record<string, string> }[];
let expoReply: unknown;
let handler: (req: Request) => Promise<Response>;

function fakeSupabase() {
  return {
    from(table: string) {
      const q: any = { table, filters: {} as Record<string, unknown>, op: "select", inList: null as string[] | null, payload: null as any };
      const run = async () => {
        if (table === "service_providers") {
          if (db.failProviderLookup) throw new Error("db down");
          const user_id = db.providers[String(q.filters.id)] ?? null;
          return { data: user_id ? { user_id } : null, error: null };
        }
        if (table === "push_log") {
          if (db.failLogWith) return { data: null, error: { code: db.failLogWith } };
          if (db.log.has(q.payload.dedupe_key)) return { data: null, error: { code: "23505" } };
          db.log.add(q.payload.dedupe_key);
          return { data: null, error: null };
        }
        if (table === "push_tokens") {
          if (q.op === "delete") { db.deleted.push(...(q.inList ?? [])); db.tokens = db.tokens.filter((t) => !(q.inList ?? []).includes(t.token)); return { data: null, error: null }; }
          return { data: db.tokens.filter((t) => t.user_id === q.filters.user_id && t.role === q.filters.role).map((t) => ({ token: t.token })), error: null };
        }
        return { data: null, error: null };
      };
      q.select = () => q; q.eq = (c: string, v: unknown) => { q.filters[c] = v; return q; };
      q.maybeSingle = run; q.insert = (p: unknown) => { q.payload = p; q.op = "insert"; return run(); };
      q.delete = () => { q.op = "delete"; return q; }; q.in = (_c: string, list: string[]) => { q.inList = list; return run(); };
      q.then = (res: any, rej: any) => run().then(res, rej);
      return q;
    },
  };
}

async function load() {
  const out = await build({
    entryPoints: [resolve(FUNCTION_DIR, "index.ts")], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "error",
    absWorkingDir: resolve(__dirname, "../../../.."),
    plugins: [{
      name: "fake-deno-urls",
      setup(b) {
        b.onResolve({ filter: /^https:\/\// }, (a) => ({ path: a.path, namespace: "fake" }));
        b.onLoad({ filter: /.*/, namespace: "fake" }, (a) => ({
          loader: "js",
          contents: a.path.includes("http/server") ? "export const serve = (h) => { globalThis.__handler = h; };" : "export const createClient = () => globalThis.__fakeSupabase();",
        }));
      },
    }],
  });
  const code = out.outputFiles[0]!.text;
  await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code + `\n// ${Math.random()}`).toString("base64")}`);
  handler = (globalThis as any).__handler;
}

const call = (body: unknown, headers: Record<string, string> = { "x-webhook-secret": "s3cret" }) =>
  handler(new Request("https://f/notify", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
const newRequestRow = { id: "r1", provider_id: "pro-1", type: "new_booking", booking_id: B, title: "New Booking Request 📋" };
const webhook = (over: Record<string, unknown> = {}) => ({ type: "INSERT", table: "provider_notifications", record: newRequestRow, ...over });

beforeEach(async () => {
  db = { providers: { "pro-1": "user-pro" }, tokens: [{ token: TOKEN, user_id: "user-pro", role: "provider" }], log: new Set(), deleted: [], failProviderLookup: false, failLogWith: null };
  sent = []; expoReply = { data: [{ status: "ok" }] };
  (globalThis as any).Deno = { env: { get: (k: string) => ({ PUSH_WEBHOOK_SECRET: "s3cret", SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k" } as Record<string, string>)[k] } };
  (globalThis as any).__fakeSupabase = fakeSupabase;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => { sent.push({ url, body: JSON.parse(init.body), headers: init.headers }); return new Response(JSON.stringify(expoReply), { status: 200 }); }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await load();
});

describe("notify-push (the real function code)", () => {
  it("refuses a call without the right secret and sends nothing", async () => {
    for (const headers of [{}, { "x-webhook-secret": "wrong" }, { "x-webhook-secret": "s3cre" }, { "x-webhook-secret": "s3cret!" }] as Record<string, string>[]) {
      expect((await call(webhook(), headers)).status).toBe(401);
    }
    expect(sent).toHaveLength(0);
  });
  it("ignores GET and non-JSON and other events and other tables", async () => {
    expect((await handler(new Request("https://f/", { method: "GET" }))).status).toBe(200);
    expect(await (await call("not json")).json()).toEqual({ skipped: "not json" });
    expect(await (await call(webhook({ type: "UPDATE" }))).json()).toEqual({ skipped: "not an insert" });
    expect(await (await call(webhook({ table: "bookings" }))).json()).toEqual({ skipped: "other table" });
    expect(sent).toHaveLength(0);
  });
  it("sends a new request to the pro's phone: loud, with the booking to open, to Expo", async () => {
    const r = await (await call(webhook())).json();
    expect(r).toMatchObject({ sent: 1, removed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://exp.host/--/api/v2/push/send");
    expect(sent[0]!.body).toEqual([expect.objectContaining({
      to: TOKEN, title: "New job request", channelId: "requests", sound: "new_request.wav", priority: "high", ttl: 3600,
      data: { kind: "new_request", audience: "provider", bookingId: B },
    })]);
  });
  it("sends only ONE alert when the database writes the same event three times", async () => {
    for (let i = 0; i < 3; i++) await call(webhook({ record: { ...newRequestRow, id: `r${i}` } }));
    expect(sent).toHaveLength(1);
    expect(await (await call(webhook())).json()).toEqual({ skipped: "duplicate" });
  });
  it("a different booking is a different alert", async () => {
    await call(webhook());
    await call(webhook({ record: { ...newRequestRow, booking_id: "11111111-2222-4333-8444-555555555555" } }));
    expect(sent).toHaveLength(2);
  });
  it("a customer notification goes to the customer's phone with clean wording", async () => {
    db.tokens.push({ token: "ExponentPushToken[customerphone1234567890]", user_id: "user-c", role: "customer" });
    await call({ type: "INSERT", table: "customer_notifications", record: { id: "c1", user_id: "user-c", type: "job_started", booking_id: B, title: "🚀 Your Pro Has Arrived!" } });
    expect(sent[0]!.body[0]).toMatchObject({ to: "ExponentPushToken[customerphone1234567890]", title: "Your pro started the job", channelId: "updates", sound: "default" });
    expect(JSON.stringify(sent[0]!.body)).not.toContain("Arrived");
  });
  it("never sends a pro's alert to a customer phone or the reverse (role is checked)", async () => {
    db.tokens = [{ token: TOKEN, user_id: "user-pro", role: "customer" }];
    expect(await (await call(webhook())).json()).toEqual({ skipped: "no phone registered" });
    expect(sent).toHaveLength(0);
  });
  it("skips unknown types, a missing recipient and a person with no phone", async () => {
    expect(await (await call(webhook({ record: { ...newRequestRow, type: "kyc_submitted" } }))).json()).toEqual({ skipped: "type not pushed" });
    expect(await (await call(webhook({ record: { ...newRequestRow, provider_id: "ghost" } }))).json()).toEqual({ skipped: "no recipient" });
    db.tokens = [];
    expect(await (await call(webhook())).json()).toEqual({ skipped: "no phone registered" });
    expect(sent).toHaveLength(0);
  });
  it("forgets a phone that Expo says is gone", async () => {
    db.tokens.push({ token: "ExponentPushToken[secondphone1234567890]", user_id: "user-pro", role: "provider" });
    expoReply = { data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] };
    const r = await (await call(webhook())).json();
    expect(r).toMatchObject({ sent: 1, removed: 1 });
    expect(db.deleted).toEqual(["ExponentPushToken[secondphone1234567890]"]);
  });
  it("still sends when the de-duplication log has a problem other than a repeat", async () => {
    db.failLogWith = "42P01";
    expect(await (await call(webhook())).json()).toMatchObject({ sent: 1 });
  });
  it("never throws back at the webhook when the database fails", async () => {
    db.failProviderLookup = true;
    const res = await call(webhook());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ error: "failed" });
  });
  it("refuses to run when the secret is not configured at all", async () => {
    (globalThis as any).Deno = { env: { get: () => undefined } };
    expect((await call(webhook())).status).toBe(500);
  });
});
