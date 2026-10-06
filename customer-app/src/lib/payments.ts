/**
 * Customer side of Razorpay. The browser never decides the amount: it sends a booking id to
 * `create-razorpay-order`, opens Checkout with what the server returns, then asks
 * `verify-razorpay-payment` to confirm. If the tab is closed after paying, the Razorpay webhook
 * settles the booking anyway and the booking screen updates through realtime.
 */
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

export type PayErrorCode =
  | "not_found" | "forbidden" | "not_completed" | "already_paid" | "refunded" | "bad_amount"
  | "gateway" | "config" | "signature" | "review" | "unauthorized" | "network" | "script" | "unexpected";

const MESSAGES: Record<PayErrorCode, string> = {
  not_found: "We couldn't find this booking.",
  forbidden: "This booking belongs to a different account.",
  not_completed: "You can pay once the pro has finished the job.",
  already_paid: "This booking is already paid.",
  refunded: "This booking was refunded.",
  bad_amount: "This booking has no amount to pay. Contact support.",
  gateway: "The payment service is busy. Please try again in a minute.",
  config: "Online payment isn't available right now. Please try again later.",
  signature: "We couldn't verify the payment. If money was deducted it will be reconciled automatically.",
  review: "We received your payment but need to review it. Contact support, you won't be charged twice.",
  unauthorized: "Your session has expired. Log in again and retry.",
  network: "No connection. Check your internet and try again.",
  script: "Couldn't load the payment window. Check your connection and try again.",
  unexpected: "Something went wrong. Please try again.",
};

export const payErrorMessage = (code: PayErrorCode) => MESSAGES[code] ?? MESSAGES.unexpected;
const KNOWN = new Set<string>(Object.keys(MESSAGES));

export async function parsePayError(err: unknown): Promise<PayErrorCode> {
  const e = err as { name?: string; context?: unknown } | null;
  if (!e) return "unexpected";
  if (e.name === "FunctionsFetchError") return "network";
  const ctx = e.context as { json?: () => Promise<unknown> } | undefined;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { code?: string } | null;
      if (body?.code && KNOWN.has(body.code)) return body.code as PayErrorCode;
    } catch { /* not JSON */ }
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  return "unexpected";
}

/** ₹1,180.00 style amount from paise-free rupees. */
export const formatRupees = (n: number) =>
  `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export type PayResult =
  | { status: "paid" }
  | { status: "pending" }      // paid at Razorpay, still confirming on our side (webhook will finish)
  | { status: "dismissed" }    // customer closed the window
  | { status: "failed"; code: PayErrorCode };

type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type CheckoutOptions = {
  key: string; amount: number; currency: string; order_id: string; name: string; description: string;
  prefill: { name: string; contact: string; email: string };
  theme: { color: string };
  modal: { ondismiss: () => void };
  handler: (r: CheckoutResponse) => void;
};
type CheckoutInstance = { open: () => void; on: (ev: string, cb: (r: unknown) => void) => void };
declare global {
  interface Window { Razorpay?: new (o: CheckoutOptions) => CheckoutInstance }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise: Promise<boolean> | null = null;

export function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  scriptPromise ??= new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve(Boolean(window.Razorpay));
    s.onerror = () => { scriptPromise = null; s.remove(); resolve(false); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

type OrderResponse = {
  order_id: string; amount: number; currency: string; key_id: string; description: string;
  prefill: { name: string; contact: string; email: string };
};

export async function payForBooking(bookingId: string): Promise<PayResult> {
  const ready = await loadCheckout();
  if (!ready) return { status: "failed", code: "script" };

  const { data, error } = await supabase.functions.invoke("create-razorpay-order", { body: { booking_id: bookingId } });
  if (error || !data?.order_id) {
    const code = error ? await parsePayError(error) : "unexpected";
    return code === "already_paid" ? { status: "paid" } : { status: "failed", code };
  }
  const order = data as OrderResponse;

  return new Promise<PayResult>((resolve) => {
    const rzp = new window.Razorpay!({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: BRAND.name,
      description: order.description,
      prefill: order.prefill,
      theme: { color: BRAND.ink },
      modal: { ondismiss: () => resolve({ status: "dismissed" }) },
      handler: async (r) => {
        const { data: v, error: vErr } = await supabase.functions.invoke("verify-razorpay-payment", { body: r });
        if (vErr) {
          const code = await parsePayError(vErr);
          // The money moved. Only a hard rejection is shown as an error; everything else waits for the webhook.
          return resolve(code === "signature" || code === "review" ? { status: "failed", code } : { status: "pending" });
        }
        resolve(v?.status === "paid" ? { status: "paid" } : { status: "pending" });
      },
    });
    rzp.on("payment.failed", () => { /* Checkout shows the reason and lets the customer retry inside the window */ });
    rzp.open();
  });
}
