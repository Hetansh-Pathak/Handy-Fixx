import { dbExtraKind, extraWorkErrorMessage, type ExtraRow, type ExtraWorkKind } from "@handyfix/shared";
import { readBytes } from "@/features/attachments/api";
import { getSupabase } from "@/lib/supabase";

const BUCKET = "booking-extras";
const SIGNED_URL_SECONDS = 60 * 60;

export const extrasKey = (bookingId: string) => ["booking-extras", bookingId] as const;

type RpcResult = { ok: boolean; reason?: string; id?: string };

function check(data: unknown, error: { message: string } | null): RpcResult {
  if (error) throw new Error(error.message);
  const result = (data ?? { ok: false }) as RpcResult;
  if (!result.ok) throw new Error(extraWorkErrorMessage(result.reason));
  return result;
}

/** Customer and the assigned pro can read a booking's extras (RLS). Oldest first, like the bill. */
export async function fetchExtras(bookingId: string): Promise<ExtraRow[]> {
  const { data, error } = await getSupabase()
    .from("booking_extras")
    .select("id, title, kind, amount, photo_path, status, created_at")
    .eq("booking_id", bookingId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ExtraRow[];
}

/** Parts need a photo of the shop bill. It goes in the pro's own folder; the customer reads it through the extra. */
export async function uploadBillPhoto(userId: string, bookingId: string, uri: string, mimeType: string): Promise<string> {
  const bytes = await readBytes(uri);
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const path = `${userId}/${bookingId}/${Date.now()}.${ext}`;
  const { error } = await getSupabase().storage.from(BUCKET).upload(path, bytes, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Could not upload the bill photo: ${error.message}`);
  return path;
}

export async function billPhotoUrl(path: string): Promise<string | null> {
  const { data } = await getSupabase().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

export async function addExtra(args: { bookingId: string; title: string; amount: number; kind: ExtraWorkKind; photoPath: string | null }): Promise<void> {
  const { data, error } = await getSupabase().rpc("add_booking_extra", {
    p_booking_id: args.bookingId,
    p_title: args.title.trim(),
    p_amount: args.amount,
    p_kind: dbExtraKind(args.kind),
    p_photo_path: args.photoPath,
  });
  check(data, error);
}

export async function withdrawExtra(extraId: string): Promise<void> {
  const { data, error } = await getSupabase().rpc("withdraw_booking_extra", { p_extra_id: extraId });
  check(data, error);
}

/** The customer's one tap. Only an approval changes the bill. */
export async function decideExtra(extraId: string, approve: boolean): Promise<void> {
  const { data, error } = await getSupabase().rpc("decide_booking_extra", { p_extra_id: extraId, p_approve: approve });
  check(data, error);
}
