// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore Plain JavaScript generated from packages/shared/src/push by `npm run push:build` (the wording and de-duplication rules).
import { dedupeKey, isExpoPushToken, pushMessageFor } from "./shared-push.js";

declare const Deno: { env: { get: (name: string) => string | undefined } };

// DEPLOYED 2026-10-29 (version 1, verify_jwt off). Sends a phone notification (through Expo's free push service) whenever HandyFix writes a row into
// provider_notifications or customer_notifications. It is called by a database trigger (proposal 20261121, see docs/PUSH_SETUP.md).
//
// What it does, in order
//   1. Checks the shared secret header. Anything without it is refused, so nobody can trigger alerts from outside.
//   2. Works out who the row is for and what the alert says (pushMessageFor: fixed, clean wording; unknown types are skipped).
//   3. Skips repeats: it records (audience, person, event, booking) in push_log first. The live database writes several
//      notification rows per booking event; without this a pro would get 2-3 alerts for one request.
//   4. Finds that person's phones (push_tokens) and sends the alert. A phone Expo says no longer exists is removed.
// It never reads or sends anything else, and it never throws back at the webhook (a failed alert must not block a booking).
//
// Secrets: PUSH_WEBHOOK_SECRET (you choose a long random value and type it in the dashboard; the same value goes into the vault as push_webhook_secret).
//          SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. EXPO_ACCESS_TOKEN is optional (only if you
//          turned on "enhanced push security" in your Expo account).
// Deploy with:  supabase functions deploy notify-push --no-verify-jwt
// (The trigger does not send a Supabase login. Security = the secret header below.)

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TTL_SECONDS = 3600;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Same-length comparison that does not stop at the first different character. */
function sameSecret(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

type Audience = "customer" | "provider";
type WebhookPayload = { type?: string; table?: string; record?: Record<string, unknown> | null };

serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ ok: true });

  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!secret) return reply({ error: "PUSH_WEBHOOK_SECRET is not set" }, 500);
  if (!sameSecret(req.headers.get("x-webhook-secret"), secret)) return reply({ error: "forbidden" }, 401);

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return reply({ skipped: "not json" });
  }
  if (payload.type !== "INSERT" || !payload.record) return reply({ skipped: "not an insert" });

  const audience: Audience | null =
    payload.table === "provider_notifications" ? "provider" : payload.table === "customer_notifications" ? "customer" : null;
  if (!audience) return reply({ skipped: "other table" });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });
    const record = payload.record;

    // Who is it for? Customer rows carry the account id; pro rows carry the pro's row id, which maps to the account.
    let userId: string | null = null;
    if (audience === "customer") {
      userId = typeof record.user_id === "string" ? record.user_id : null;
    } else if (typeof record.provider_id === "string") {
      const { data } = await supabase.from("service_providers").select("user_id").eq("id", record.provider_id).maybeSingle();
      userId = (data as { user_id: string | null } | null)?.user_id ?? null;
    }
    if (!userId) return reply({ skipped: "no recipient" });

    const message = pushMessageFor(audience, record);
    if (!message) return reply({ skipped: "type not pushed" });

    // Skip a repeat of the same event (first writer wins). Any other problem with the log must not lose the alert.
    const key = dedupeKey(audience, userId, record);
    const { error: logError } = await supabase.from("push_log").insert({ dedupe_key: key });
    if (logError?.code === "23505") return reply({ skipped: "duplicate" });

    const { data: rows } = await supabase.from("push_tokens").select("token").eq("user_id", userId).eq("role", audience);
    const tokens = ((rows ?? []) as { token: string }[]).map((r) => r.token).filter(isExpoPushToken);
    if (tokens.length === 0) return reply({ skipped: "no phone registered" });

    const messages = tokens.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      data: message.data,
      channelId: message.channelId,
      sound: message.sound,
      priority: message.priority,
      ttl: TTL_SECONDS,
    }));
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages) });
    const body = (await res.json().catch(() => ({}))) as { data?: { status?: string; details?: { error?: string } }[] };

    // A phone that was reset or where the app was removed: forget its token so it is not tried again.
    const dead: string[] = [];
    (body.data ?? []).forEach((ticket, i) => {
      if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered" && tokens[i]) dead.push(tokens[i]);
    });
    if (dead.length) await supabase.from("push_tokens").delete().in("token", dead);

    return reply({ sent: tokens.length - dead.length, removed: dead.length, httpStatus: res.status });
  } catch (e) {
    // Never fail the webhook loudly: a missed alert is not worth blocking the booking that caused it.
    console.error("notify-push failed", e instanceof Error ? e.message : e);
    return reply({ error: "failed" });
  }
});
