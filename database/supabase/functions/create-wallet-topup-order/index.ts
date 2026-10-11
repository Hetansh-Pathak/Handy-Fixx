// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase resolves Deno URL imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get: (name: string) => string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function razorpay(path: string, method: "GET" | "POST", body?: unknown) {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) throw new Error("Razorpay keys are not configured");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description ?? `Razorpay error ${res.status}`);
  return data;
}

// Returns { admin, user, provider } for the signed-in provider, or a Response to return.
async function requireProvider(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return { error: json({ error: "Server is not configured" }, 500) };
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: json({ error: "Please sign in again" }, 401) };
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: provider } = await admin
    .from("service_providers")
    .select("id, full_name, email, phone, status, kyc_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!provider) return { error: json({ error: "Provider account not found" }, 403) };
  return { admin, user, provider };
}

// Creates a Razorpay order so a provider can pay their dues by UPI / card.
// The wallet is credited ONLY by the webhook after Razorpay confirms the payment.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await requireProvider(req);
    if ("error" in ctx) return ctx.error;
    const { admin, provider } = ctx;

    const { amount } = await req.json();
    const rupees = Number(amount);
    if (!Number.isInteger(rupees) || rupees < 1 || rupees > 50000) {
      return json({ error: "Enter a whole amount between ₹1 and ₹50,000" }, 400);
    }

    const order = await razorpay("/orders", "POST", {
      amount: rupees * 100,
      currency: "INR",
      receipt: `topup_${provider.id.slice(0, 8)}_${Date.now()}`,
      notes: { type: "wallet_topup", provider_id: provider.id },
    });

    const { error } = await admin.from("wallet_topup_orders").insert({
      order_id: order.id,
      provider_id: provider.id,
      amount: rupees,
    });
    if (error) throw error;

    return json({
      order_id: order.id,
      amount_paise: rupees * 100,
      key_id: Deno.env.get("RAZORPAY_KEY_ID"),
      prefill: { name: provider.full_name ?? "", email: provider.email ?? "", contact: provider.phone ?? "" },
    });
  } catch (e) {
    console.error("create-wallet-topup-order:", e);
    return json({ error: e instanceof Error ? e.message : "Could not start the payment" }, 500);
  }
});
