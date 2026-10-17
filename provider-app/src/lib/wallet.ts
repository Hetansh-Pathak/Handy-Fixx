import { supabase } from '@/integrations/supabase/client';

export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export type WalletSummary = {
  ok: boolean;
  provider_id: string;
  balance: number;
  dues: number;
  available: number;
  dues_limit: number;
  min_payout: number;
  fee_rate: number;
  live_since: string;
  blocked: boolean;
  block_reason: 'dues_limit' | 'unsettled_job' | null;
  unsettled_jobs: number;
};

export type WalletTx = {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  booking_id: string | null;
  created_at: string;
};

export const TX_LABEL: Record<string, string> = {
  online_credit: 'Online payment received',
  cash_fee: 'Cash job: platform fee (dues)',
  topup: 'Dues paid / wallet top-up',
  payout: 'Withdrawal requested',
  payout_reversal: 'Withdrawal failed: returned',
  refund_reversal: 'Customer refund reversed',
  adjustment: 'Adjustment by support',
};

/** Calls an Edge Function and turns any failure into a readable Error. */
export async function callEdge<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json();
        // Our functions reply { error }, the Supabase gateway replies { message } (e.g. "Invalid JWT")
        const detail = parsed?.error ?? parsed?.message;
        if (detail) message = typeof detail === 'string' ? detail : JSON.stringify(detail);
      }
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>) && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

let razorpayPromise: Promise<boolean> | null = null;
/** Loads Razorpay Checkout once. Resolves false if it cannot load (offline / blocked). */
export function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve(true);
  if (razorpayPromise) return razorpayPromise;
  razorpayPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      razorpayPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return razorpayPromise;
}

export const BLOCK_MESSAGE: Record<string, string> = {
  dues_limit: 'Your dues reached the limit. Pay your dues in Wallet to go online and accept new jobs.',
  unsettled_job: 'A completed job has no payment recorded. Collect it (QR or cash) to accept new jobs.',
};
