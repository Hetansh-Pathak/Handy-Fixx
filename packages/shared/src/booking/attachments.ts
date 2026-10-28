/**
 * Photos and a voice note a customer adds to a booking to show the problem. Files live in the private
 * `booking-attachments` bucket under `{customer auth id}/{booking id}/…` (the storage policy only lets
 * a user write inside their own first folder); each one gets a `booking_attachments` row, which is what
 * lets the assigned pro read it.
 */

export type AttachmentType = "image" | "audio";

export const ATTACHMENT_LIMITS = {
  maxPhotos: 5,
  maxPhotoBytes: 10 * 1024 * 1024,
  maxAudioSeconds: 120,
  maxAudioBytes: 10 * 1024 * 1024,
} as const;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/3gpp": "3gp",
};

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
  m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg", webm: "audio/webm", ogg: "audio/ogg", "3gp": "audio/3gpp",
};

const typeOfMime = (mime: string): AttachmentType | null =>
  mime in MIME_EXT ? (mime.startsWith("image/") ? "image" : "audio") : null;

/**
 * The file's media type: the one the picker reported when it is one we accept, otherwise guessed from the
 * file name or URI. Null when it is not a photo or audio format we store.
 */
export function resolveAttachmentMime(reported: string | null | undefined, uriOrName: string): string | null {
  const r = reported?.toLowerCase().split(";")[0]?.trim();
  if (r && r in MIME_EXT) return r;
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(uriOrName)?.[1]?.toLowerCase();
  return (ext && EXT_MIME[ext]) || null;
}

export type DraftAttachment = {
  type: AttachmentType;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds?: number | null;
};

/** Why this file cannot be attached, or null when it is fine. */
export function checkAttachment(a: DraftAttachment): string | null {
  if (typeOfMime(a.mimeType) !== a.type) return a.type === "image" ? "Pick a JPG, PNG or HEIC photo." : "This audio format is not supported.";
  if (a.type === "image") {
    if (a.sizeBytes != null && a.sizeBytes > ATTACHMENT_LIMITS.maxPhotoBytes) return "This photo is larger than 10 MB.";
    return null;
  }
  if (a.sizeBytes != null && a.sizeBytes > ATTACHMENT_LIMITS.maxAudioBytes) return "This voice note is larger than 10 MB.";
  if (a.durationSeconds != null && a.durationSeconds > ATTACHMENT_LIMITS.maxAudioSeconds + 1) return "Keep the voice note under 2 minutes.";
  if (a.durationSeconds != null && a.durationSeconds < 1) return "That voice note is too short.";
  return null;
}

/** How many more photos fit. */
export const photosLeft = (current: number): number => Math.max(0, ATTACHMENT_LIMITS.maxPhotos - current);

/** `{userId}/{bookingId}/{type}-{n}-{stamp}.{ext}`: unique per upload and inside the user's own folder. */
export function attachmentStoragePath(args: { userId: string; bookingId: string; index: number; mimeType: string; stamp: number }): string {
  const type = typeOfMime(args.mimeType) ?? "file";
  const ext = MIME_EXT[args.mimeType] ?? "bin";
  return `${args.userId}/${args.bookingId}/${type}-${args.index + 1}-${args.stamp}.${ext}`;
}

/** "0:07", "1:30". */
export function formatClipDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
