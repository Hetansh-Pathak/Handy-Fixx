import { AVATAR_BUCKET, avatarPathFromUrl, avatarStoragePath, checkAvatar, friendlyAuthError, type ProviderProfilePatch } from "@handyfix/shared";
import { readBytes } from "@/features/attachments/api";
import { getSupabase } from "@/lib/supabase";

export type ProviderProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  experience_years: number | null;
  city: string | null;
  pincodes: string[] | null;
  service_ids: string[] | null;
  upi_id: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  status: string | null;
  kyc_status: string | null;
};

const PROFILE_COLUMNS =
  "id, full_name, phone, email, avatar_url, bio, experience_years, city, pincodes, service_ids, upi_id, bank_account_name, bank_account_number, bank_ifsc, status, kyc_status";

export const providerProfileKey = (providerId: string) => ["provider-profile", providerId] as const;

function readable(error: { message: string; code?: string }): Error {
  return new Error(error.code === "P0001" ? error.message : friendlyAuthError(error.message));
}

export async function fetchProviderProfile(providerId: string): Promise<ProviderProfileRow | null> {
  const { data, error } = await getSupabase().from("service_providers").select(PROFILE_COLUMNS).eq("id", providerId).maybeSingle();
  if (error) throw readable(error);
  return (data as ProviderProfileRow | null) ?? null;
}

/** RLS lets a pro update only their own row; no row back means the update did not apply. */
export async function saveProviderProfile(providerId: string, patch: ProviderProfilePatch): Promise<void> {
  const { data, error } = await getSupabase().from("service_providers").update(patch).eq("id", providerId).select("id").maybeSingle();
  if (error) throw readable(error);
  if (!data) throw new Error("Your profile could not be saved. Sign out and in again, then retry.");
}

/** The `avatars` bucket comes from a proposal; until it is applied uploads fail with "Bucket not found". */
const notSwitchedOn = (message: string) => /bucket not found/i.test(message);

/**
 * Uploads a new profile photo, saves its public URL on the pro's row, then removes older photos.
 * Old files are cleaned up last so a failed save never leaves the pro without a picture.
 */
export async function uploadProviderAvatar(args: { userId: string; providerId: string; uri: string; mimeType: string | null }): Promise<string> {
  const supabase = getSupabase();
  const bytes = await readBytes(args.uri);
  const problem = checkAvatar(args.mimeType, bytes.byteLength);
  if (problem) throw new Error(problem);
  const mime = args.mimeType!;
  const path = avatarStoragePath(args.userId, mime, Date.now());

  const up = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    throw new Error(notSwitchedOn(up.error.message) ? "Profile photos are not switched on yet. Ask the HandyFix team to enable them." : up.error.message);
  }
  const url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from("service_providers").update({ avatar_url: url }).eq("id", args.providerId);
  if (error) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]).catch(() => undefined);
    throw readable(error);
  }
  await removeOtherAvatars(args.userId, path);
  return url;
}

export async function removeProviderAvatar(args: { userId: string; providerId: string; currentUrl: string | null }): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("service_providers").update({ avatar_url: null }).eq("id", args.providerId);
  if (error) throw readable(error);
  const path = avatarPathFromUrl(args.currentUrl);
  if (path) await supabase.storage.from(AVATAR_BUCKET).remove([path]).catch(() => undefined);
}

async function removeOtherAvatars(userId: string, keep: string): Promise<void> {
  const supabase = getSupabase();
  const { data } = await supabase.storage.from(AVATAR_BUCKET).list(userId, { limit: 20 });
  const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await supabase.storage.from(AVATAR_BUCKET).remove(old).catch(() => undefined);
}
