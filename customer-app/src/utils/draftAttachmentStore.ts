import { supabase } from "@/integrations/supabase/client";

export type StoredDraftFile = {
  name: string;
  type: "image" | "audio";
  mimeType: string;
  dataUrl: string;
  durationSeconds?: number;
};

const DB_NAME = "HandyFixDraftStore";
const STORE_NAME = "draft_files";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDraftFile(draftId: string, file: StoredDraftFile): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ id: `${draftId}_${file.name}`, draftId, ...file });
  } catch (e) {
    console.error("Draft save error:", e);
  }
}

export async function removeDraftFile(draftId: string, fileName: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(`${draftId}_${fileName}`);
  } catch (e) {
    console.error("Draft delete error:", e);
  }
}

export async function getDraftFiles(draftId: string): Promise<StoredDraftFile[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result || [];
        resolve(all.filter((item: any) => item.draftId === draftId));
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function clearDraftFiles(draftId: string): Promise<void> {
  try {
    const files = await getDraftFiles(draftId);
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    files.forEach((f) => store.delete(`${draftId}_${f.name}`));
  } catch {
    // non-blocking
  }
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataURLtoBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "application/octet-stream";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export async function uploadPendingDraftFiles(
  bookingId: string,
  userId: string,
  draftId: string,
): Promise<void> {
  const pendingFiles = await getDraftFiles(draftId);
  if (pendingFiles.length === 0) return;

  for (const file of pendingFiles) {
    const blob = dataURLtoBlob(file.dataUrl);
    const storagePath = `${userId}/${draftId}/${file.name}`;

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from("booking-attachments")
      .upload(storagePath, blob, { contentType: file.mimeType, upsert: true });

    if (uploadError) {
      console.warn("Storage upload warning for draft file:", uploadError.message);
    }

    // Insert into booking_attachments table
    await (supabase as unknown as {
      from: (t: string) => {
        insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
      };
    }).from("booking_attachments").insert([{
      booking_id: bookingId,
      uploaded_by: userId,
      type: file.type,
      storage_path: storagePath,
      mime_type: file.mimeType,
      size_bytes: blob.size,
      duration_seconds: file.durationSeconds ?? null,
    }]);
  }

  // Clean up indexedDB after uploading
  await clearDraftFiles(draftId);
}
