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
  if (!res.ok) {
    console.error("razorpay error", res.status, JSON.stringify(data));
    const desc = data?.error?.description ?? `Razorpay error ${res.status}`;
    if (res.status === 401) throw new Error(`Razorpay rejected the API keys (${desc}). Check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET secrets.`);
    if (res.status === 404 || /not found|not enabled|not allowed|feature/i.test(desc)) {
      throw new Error(`Razorpay: ${desc}. UPI QR Codes may not be enabled on this Razorpay account (they only work with Live keys).`);
    }
    throw new Error(`Razorpay: ${desc}`);
  }
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

// Creates (or reuses) a single-use, fixed-amount UPI QR for ONE completed booking.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ctx = await requireProvider(req);
    if ("error" in ctx) return ctx.error;
    const { admin, provider } = ctx;

    const { booking_id } = await req.json();
    if (!booking_id || typeof booking_id !== "string") return json({ error: "booking_id is required" }, 400);

    const { data: booking } = await admin
      .from("bookings")
      .select("id, provider_id, status, total_amount, provider_amount, platform_fee")
      .eq("id", booking_id)
      .maybeSingle();
    if (!booking || booking.provider_id !== provider.id) return json({ error: "Booking not found" }, 404);
    if (String(booking.status) !== "completed") return json({ error: "Complete the job with the customer code first" }, 400);

    const total = Number(booking.total_amount ?? 0);
    if (!(total > 0)) return json({ error: "This booking has no amount to collect" }, 400);

    const { data: existing } = await admin.from("booking_payments").select("*").eq("booking_id", booking.id).maybeSingle();
    if (existing?.status === "paid") return json({ error: "This booking is already paid", already_paid: true, method: existing.method }, 409);

    // Reuse an open QR that is still valid for at least 3 minutes
    if (existing?.qr_id && existing.qr_image_url && existing.qr_expires_at &&
        new Date(existing.qr_expires_at).getTime() - Date.now() > 3 * 60 * 1000) {
      return json({ qr_id: existing.qr_id, qr_image_url: existing.qr_image_url, expires_at: existing.qr_expires_at, amount: total, reused: true });
    }

    // Close the old QR (best effort) so it can never be paid by mistake
    if (existing?.qr_id) {
      try { await razorpay(`/payments/qr_codes/${existing.qr_id}/close`, "POST"); } catch (_) { /* already closed */ }
    }

    const closeBy = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes
    const qr = await razorpay("/payments/qr_codes", "POST", {
      type: "upi_qr",
      name: `apnabanda #${booking.id.slice(0, 8).toUpperCase()}`,
      usage: "single_use",
      fixed_amount: true,
      payment_amount: Math.round(total * 100),
      description: `apnabanda booking #${booking.id.slice(0, 8).toUpperCase()}`,
      close_by: closeBy,
      notes: { booking_id: booking.id, provider_id: provider.id, purpose: "booking_payment" },
    });

    const expiresAt = new Date(closeBy * 1000).toISOString();
    const { error } = await admin.from("booking_payments").upsert({
      booking_id: booking.id,
      provider_id: provider.id,
      status: "qr_open",
      total_amount: total,
      provider_amount: Number(booking.provider_amount ?? 0),
      platform_fee: Number(booking.platform_fee ?? 0),
      qr_id: qr.id,
      qr_image_url: qr.image_url,
      qr_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "booking_id" });
    if (error) throw error;

    return json({ qr_id: qr.id, qr_image_url: qr.image_url, expires_at: expiresAt, amount: total });
  } catch (e) {
    console.error("create-qr-payment:", e);
    return json({ error: e instanceof Error ? e.message : "Could not create the QR" }, 500);
  }
});
