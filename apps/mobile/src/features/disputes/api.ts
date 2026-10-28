import { disputeErrorMessage, type DisputeOutcome, type DisputeReason, type DisputeStatus } from "@handyfix/shared";
import { getSupabase } from "@/lib/supabase";

export const disputeKey = (bookingId: string) => ["booking-dispute", bookingId] as const;

export type DisputeRow = {
  id: string;
  category: DisputeReason;
  details: string;
  provider_reply: string | null;
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  decision_note: string | null;
  appealed_by: "customer" | "provider" | null;
  appealed_at: string | null;
  created_at: string;
};

type RpcResult = { ok: boolean; reason?: string };

function check(data: unknown, error: { message: string } | null): void {
  if (error) throw new Error(error.message);
  const result = (data ?? { ok: false }) as RpcResult;
  if (!result.ok) throw new Error(disputeErrorMessage(result.reason));
}

/** One dispute per booking. Both sides can read it (RLS). */
export async function fetchDispute(bookingId: string): Promise<DisputeRow | null> {
  const { data, error } = await getSupabase()
    .from("booking_disputes")
    .select("id, category, details, provider_reply, status, outcome, decision_note, appealed_by, appealed_at, created_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DisputeRow | null) ?? null;
}

export async function raiseDispute(bookingId: string, reason: DisputeReason, details: string): Promise<void> {
  const { data, error } = await getSupabase().rpc("raise_booking_dispute", { p_booking_id: bookingId, p_category: reason, p_details: details.trim() });
  check(data, error);
}

export async function replyToDispute(disputeId: string, reply: string): Promise<void> {
  const { data, error } = await getSupabase().rpc("reply_booking_dispute", { p_dispute_id: disputeId, p_reply: reply.trim() });
  check(data, error);
}

export async function appealDispute(disputeId: string, note: string): Promise<void> {
  const { data, error } = await getSupabase().rpc("appeal_booking_dispute", { p_dispute_id: disputeId, p_note: note.trim() });
  check(data, error);
}
