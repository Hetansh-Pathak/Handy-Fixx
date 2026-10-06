// Edge Function: delete-customer-account
// Deletes (and anonymises) the CALLER's own customer account. Required by Google Play for any app
// that lets people create an account. The user id always comes from the verified JWT, never from
// the request body, so one user can never delete another.
//
// Deploy:  supabase functions deploy delete-customer-account
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// Supabase resolves these remote imports in its Deno Edge Function runtime.
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error The workspace TypeScript server cannot resolve Deno URL imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, makeJson } from "../_shared/cors.ts";
import { CONFIRM_PHRASE, DeletionError, deleteCustomerAccount } from "./core.ts";
import type { AdminClient } from "./core.ts";

declare const Deno: { env: { get: (name: string) => string | undefined } };

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  const json = makeJson(cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed", code: "method" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Not configured", code: "config" }, 500);

    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    if (String(body?.confirm ?? "").trim() !== CONFIRM_PHRASE) {
      return json({ error: `Type ${CONFIRM_PHRASE} to confirm.`, code: "confirm" }, 400);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as AdminClient;
    const summary = await deleteCustomerAccount(admin, { id: user.id, email: user.email });
    console.log("[delete-customer-account] done", user.id, JSON.stringify(summary));
    return json({ ok: true });
  } catch (e) {
    if (e instanceof DeletionError) {
      console.error("[delete-customer-account]", e.code, e.step ?? "", e.message);
      // 409: the request is valid but the account is not in a deletable state right now.
      const status = e.code === "step_failed" ? 500 : 409;
      return json({ error: e.message, code: e.code }, status);
    }
    console.error("[delete-customer-account] unexpected", e);
    return json({ error: "Something went wrong. Please try again.", code: "unexpected" }, 500);
  }
});
