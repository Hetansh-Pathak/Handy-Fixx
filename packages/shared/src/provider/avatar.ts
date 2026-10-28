/**
 * Profile pictures live in the public `avatars` bucket under `{auth user id}/avatar-{stamp}.{ext}`
 * (proposal 20261104000000_profile_avatars). A new name per upload means phones never show a cached old photo.
 */

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const AVATAR_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Why this image cannot be a profile picture, or null when it is fine. */
export function checkAvatar(mimeType: string | null | undefined, sizeBytes: number | null | undefined): string | null {
  if (!mimeType || !(mimeType in AVATAR_EXT)) return "Use a JPG, PNG or WebP photo.";
  if (sizeBytes != null && sizeBytes > AVATAR_MAX_BYTES) return "This photo is larger than 5 MB. Pick a smaller one.";
  if (sizeBytes != null && sizeBytes <= 0) return "This photo is empty. Pick another one.";
  return null;
}

export function avatarStoragePath(userId: string, mimeType: string, stamp: number): string {
  return `${userId}/avatar-${stamp}.${AVATAR_EXT[mimeType] ?? "jpg"}`;
}

/** The storage path inside the bucket for a saved public URL, or null if the URL is not one of ours. */
export function avatarPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0] ?? "") || null;
}

/** "Ravi Patel" → "RP"; used when there is no photo. */
export const nameInitials = (name: string | null | undefined): string =>
  (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";
