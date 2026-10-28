import { attachmentStoragePath, checkAttachment, type AttachmentType, friendlyDbError } from "@handyfix/shared";
import { Platform } from "react-native";
import { getSupabase } from "@/lib/supabase";

const BUCKET = "booking-attachments";
const SIGNED_URL_SECONDS = 60 * 60;

/** A photo or voice note picked on this phone, not uploaded yet. */
export type LocalAttachment = {
  key: string;
  type: AttachmentType;
  uri: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
};

export type BookingAttachment = {
  id: string;
  type: AttachmentType;
  url: string | null;
  durationSeconds: number | null;
};

export const attachmentsKey = (bookingId: string) => ["booking-attachments", bookingId] as const;

/** Native reads the file from disk; on web the picker hands back a blob: URL. */
export async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") return (await fetch(uri)).arrayBuffer();
  const { File } = await import("expo-file-system");
  return new File(uri).arrayBuffer();
}

export type UploadResult = { failed: number; firstError: string | null };

/**
 * Uploads after the booking exists (the path needs its id). Each file is tried on its own, so one bad
 * upload never loses the booking or the other files. Reports how many failed and the first reason, so a
 * missing bucket or storage rule shows up on screen instead of silently.
 */
export async function uploadBookingAttachments(userId: string, bookingId: string, files: readonly LocalAttachment[]): Promise<UploadResult> {
  const supabase = getSupabase();
  let failed = 0;
  let firstError: string | null = null;
  for (const [index, f] of files.entries()) {
    try {
      const bytes = await readBytes(f.uri);
      const problem = checkAttachment({ type: f.type, mimeType: f.mimeType, sizeBytes: bytes.byteLength, durationSeconds: f.durationSeconds });
      if (problem) throw new Error(problem);
      const path = attachmentStoragePath({ userId, bookingId, index, mimeType: f.mimeType, stamp: Date.now() });
      const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: f.mimeType, upsert: false });
      if (up.error) throw new Error(`Storage: ${up.error.message}`);
      const { error } = await supabase.from("booking_attachments").insert({
        booking_id: bookingId,
        uploaded_by: userId,
        type: f.type,
        storage_path: path,
        mime_type: f.mimeType,
        size_bytes: bytes.byteLength,
        duration_seconds: f.durationSeconds == null ? null : Math.round(f.durationSeconds),
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw new Error(`Saving the link: ${error.message}`);
      }
    } catch (e) {
      failed += 1;
      firstError ??= e instanceof Error ? e.message : String(e);
      console.warn("[attachments] upload failed", f.type, firstError);
    }
  }
  return { failed, firstError };
}

/**
 * When a request moves to another pro, the new booking points at the same files. The storage policy lets
 * a pro read a file once a `booking_attachments` row links it to a booking assigned to them.
 */
export async function copyBookingAttachments(userId: string, fromBookingId: string, toBookingId: string): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("booking_attachments")
    .select("type, storage_path, mime_type, size_bytes, duration_seconds")
    .eq("booking_id", fromBookingId)
    .eq("uploaded_by", userId);
  if (error || !data?.length) return;
  await supabase.from("booking_attachments").insert(data.map((r) => ({ ...r, booking_id: toBookingId, uploaded_by: userId })));
}

type AttachmentRow = { id: string; type: AttachmentType; storage_path: string; duration_seconds: number | null; created_at: string };

/** Customer (own uploads) or the assigned pro, enforced by RLS. URLs are short-lived signed links. */
export async function fetchBookingAttachments(bookingId: string): Promise<BookingAttachment[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("booking_attachments")
    .select("id, type, storage_path, duration_seconds, created_at")
    .eq("booking_id", bookingId)
    .order("created_at");
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(friendlyDbError(error));
  }
  const rows = (data ?? []) as AttachmentRow[];
  if (!rows.length) return [];
  const signed = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_SECONDS);
  const urlFor = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl] as const));
  return rows.map((r) => ({ id: r.id, type: r.type, url: urlFor.get(r.storage_path) ?? null, durationSeconds: r.duration_seconds }));
}
