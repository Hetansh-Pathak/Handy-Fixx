import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Square, RotateCcw, Trash2, Upload, X, Camera,
  FileImage, AlertCircle, Loader2, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadedAttachment = {
  type: "audio" | "image";
  storagePath: string;
  localUrl: string; // object URL or data URL for preview
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
};

export type ProblemDescriptionState = {
  audio: UploadedAttachment | null;
  images: UploadedAttachment[];
  note: string;
};

type Props = {
  userId: string | null;
  draftId: string;
  state: ProblemDescriptionState;
  onChange: (next: ProblemDescriptionState) => void;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKET = "booking-attachments";
const MAX_AUDIO_SECONDS = 60;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.8;
const MAX_NOTE_CHARS = 500;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Resize an image File to max dimensions via canvas and return a Blob */
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas 2D context unavailable")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/jpeg",
        IMAGE_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ── Upload helper ─────────────────────────────────────────────────────────────

async function uploadToStorage(
  userId: string,
  draftId: string,
  filename: string,
  blob: Blob,
  mimeType: string,
): Promise<string> {
  const path = `${userId}/${draftId}/${filename}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

async function deleteFromStorage(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

// ── Sub-component: AudioRecorder ──────────────────────────────────────────────

type AudioRecorderProps = {
  audio: UploadedAttachment | null;
  uploading: boolean;
  onRecord: (blob: Blob, mimeType: string, duration: number) => void;
  onDelete: () => void;
};

function AudioRecorder({ audio, uploading, onRecord, onDelete }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const stopRecording = useCallback((auto = false) => {
    if (!recording && !auto) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  }, [recording]);

  // Auto-stop at 60s
  useEffect(() => {
    if (recording && elapsed >= MAX_AUDIO_SECONDS) {
      stopRecording(true);
    }
  }, [elapsed, recording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setUnsupported(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick supported MIME type
      const preferredType = "audio/webm;codecs=opus";
      const fallbackType = "audio/mp4";
      const mimeType = MediaRecorder.isTypeSupported(preferredType) ? preferredType
        : MediaRecorder.isTypeSupported(fallbackType) ? fallbackType
        : "";

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const actualMime = mimeType || mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualMime });
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        if (blob.size > MAX_AUDIO_BYTES) {
          // Too large — don't upload, show message
          return;
        }
        onRecord(blob, actualMime, duration);
      };

      mr.start(100);
      startTimeRef.current = Date.now();
      setElapsed(0);
      setRecording(true);

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch {
      setPermissionDenied(true);
    }
  };

  if (unsupported) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="w-4 h-4" />
        Voice recording is not supported in this browser.
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <MicOff className="w-4 h-4 text-destructive" />
        Microphone access denied. Enable it in browser settings to record audio.
      </div>
    );
  }

  // Recorded — show player + controls
  if (audio && !recording) {
    return (
      <div className="space-y-2">
        <audio
          src={audio.localUrl}
          controls
          className="w-full h-10 rounded-xl"
          style={{ accentColor: "var(--color-primary)" }}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-border text-muted-foreground"
            onClick={onDelete}
            disabled={uploading}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-primary/30 text-primary"
            onClick={() => { onDelete(); }}
            disabled={uploading}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Re-record
          </Button>
          {uploading && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
            </span>
          )}
          {!uploading && audio.storagePath && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDuration(audio.durationSeconds ?? 0)} · {(audio.sizeBytes / 1024).toFixed(0)} KB
        </p>
      </div>
    );
  }

  // Recording in progress
  if (recording) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-mono text-foreground">
            {formatDuration(elapsed)}
          </span>
          <span className="text-xs text-muted-foreground">
            / {MAX_AUDIO_SECONDS}s max
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          className="bg-red-500 hover:bg-red-600 text-white rounded-xl"
          onClick={() => stopRecording()}
        >
          <Square className="w-3.5 h-3.5 mr-1" /> Stop
        </Button>
      </div>
    );
  }

  // Idle — show Start button
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="border-primary/30 text-primary hover:bg-primary/10 rounded-xl min-h-[44px]"
      onClick={startRecording}
    >
      <Mic className="w-4 h-4 mr-2" /> Start Recording
    </Button>
  );
}

// ── Sub-component: ImageUploader ──────────────────────────────────────────────

type ImageUploaderProps = {
  images: UploadedAttachment[];
  uploading: Record<number, boolean>;
  errors: Record<number, string>;
  onAdd: (files: FileList) => void;
  onRemove: (idx: number) => void;
};

function ImageUploader({ images, uploading, errors, onAdd, onRemove }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const remaining = MAX_IMAGES - images.length;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {images.length < MAX_IMAGES && (
        <div
          className={`border-2 border-dashed rounded-xl p-4 transition-colors text-center ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onAdd(e.target.files)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files && onAdd(e.target.files)}
          />
          <FileImage className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground mb-3">
            Drag & drop photos or choose from gallery ({remaining} remaining)
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-primary/30 text-primary rounded-xl min-h-[44px]"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5 mr-1" /> Gallery
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-primary/30 text-primary rounded-xl min-h-[44px]"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="w-3.5 h-3.5 mr-1" /> Camera
            </Button>
          </div>
        </div>
      )}

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.localUrl}
                alt={`Problem photo ${idx + 1}`}
                className="w-full aspect-square object-cover rounded-xl border border-border"
              />
              {/* Loading overlay */}
              {uploading[idx] && (
                <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
              {/* Uploaded indicator */}
              {!uploading[idx] && img.storagePath && (
                <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                </div>
              )}
              {/* Error indicator */}
              {errors[idx] && (
                <div className="absolute inset-0 rounded-xl bg-red-500/20 flex items-center justify-center p-1">
                  <p className="text-[9px] text-red-400 text-center leading-tight">{errors[idx]}</p>
                </div>
              )}
              {/* Remove button */}
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label={`Remove photo ${idx + 1}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Validation errors */}
      {Object.values(errors).filter(Boolean).map((err, i) => (
        <p key={i} className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> {err}
        </p>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProblemDescription({ userId, draftId, state, onChange }: Props) {
  const { toast } = useToast();
  const [audioUploading, setAudioUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState<Record<number, boolean>>({});
  const [imageErrors, setImageErrors] = useState<Record<number, string>>({});

  // ── Audio ──────────────────────────────────────────────────────────────────

  const handleRecord = useCallback(async (blob: Blob, mimeType: string, duration: number) => {
    const localUrl = URL.createObjectURL(blob);
    const ext = mimeType.includes("mp4") ? "m4a" : "webm";
    const attachment: UploadedAttachment = {
      type: "audio",
      storagePath: "",
      localUrl,
      mimeType,
      sizeBytes: blob.size,
      durationSeconds: duration,
    };

    // Show immediately; upload in background
    onChange({ ...state, audio: attachment });

    if (!userId) return; // not logged in — keep in memory

    setAudioUploading(true);
    try {
      const filename = `voice_${Date.now()}.${ext}`;
      const path = await uploadToStorage(userId, draftId, filename, blob, mimeType);
      onChange({ ...state, audio: { ...attachment, storagePath: path } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast({ title: "Audio upload failed", description: msg, variant: "destructive" });
    } finally {
      setAudioUploading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, draftId, state.images, state.note]);

  const handleDeleteAudio = useCallback(async () => {
    const prev = state.audio;
    if (!prev) return;
    URL.revokeObjectURL(prev.localUrl);
    onChange({ ...state, audio: null });
    if (prev.storagePath) {
      await deleteFromStorage(prev.storagePath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ── Images ─────────────────────────────────────────────────────────────────

  const handleAddImages = useCallback(async (files: FileList) => {
    const newErrors: Record<number, string> = {};
    const validFiles: File[] = [];

    Array.from(files).forEach((file) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        newErrors[state.images.length + validFiles.length] = "Only JPG, PNG, WebP allowed";
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        newErrors[state.images.length + validFiles.length] = "Max 5 MB per image";
        return;
      }
      if (state.images.length + validFiles.length >= MAX_IMAGES) return;
      validFiles.push(file);
    });

    setImageErrors(prev => ({ ...prev, ...newErrors }));

    for (const file of validFiles) {
      const localUrl = URL.createObjectURL(file);
      const idx = state.images.length;
      const stub: UploadedAttachment = {
        type: "image",
        storagePath: "",
        localUrl,
        mimeType: "image/jpeg",
        sizeBytes: file.size,
      };

      // Show thumbnail immediately
      const nextImages = [...state.images, stub];
      onChange({ ...state, images: nextImages });

      if (!userId) continue; // keep in memory if not logged in

      setImageUploading(prev => ({ ...prev, [idx]: true }));
      try {
        const compressed = await compressImage(file);
        const filename = `photo_${Date.now()}_${idx}.jpg`;
        const path = await uploadToStorage(userId, draftId, filename, compressed, "image/jpeg");
        const finalAttachment: UploadedAttachment = {
          ...stub,
          mimeType: "image/jpeg",
          sizeBytes: compressed.size,
          storagePath: path,
        };
        safeonChange({
          ...state,
          images: state.images.map((img, i) => i === idx ? finalAttachment : img)
        });
      } catch (e) {
        const rawMsg = e instanceof Error ? e.message : "Upload failed";
        const isBucketErr = /bucket not found/i.test(rawMsg);
        const userMsg = isBucketErr 
          ? "Storage setup pending — image kept in preview"
          : rawMsg;
        
        // If bucket is not created in Supabase yet, don't overlay ugly red text on photo
        if (!isBucketErr) {
          setImageErrors(prev => ({ ...prev, [idx]: userMsg }));
        }
        toast({ 
          title: "Image Upload Note", 
          description: userMsg, 
          variant: isBucketErr ? "default" : "destructive" 
        });
      } finally {
        setImageUploading(prev => ({ ...prev, [idx]: false }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, userId, draftId]);

  const handleRemoveImage = useCallback(async (idx: number) => {
    const img = state.images[idx];
    if (!img) return;
    URL.revokeObjectURL(img.localUrl);
    const nextImages = state.images.filter((_, i) => i !== idx);
    onChange({ ...state, images: nextImages });
    if (img.storagePath) {
      await deleteFromStorage(img.storagePath);
    }
    // Shift uploading/error indices
    setImageUploading(prev => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const n = Number(k);
        if (n !== idx) next[n > idx ? n - 1 : n] = v;
      });
      return next;
    });
    setImageErrors(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const n = Number(k);
        if (n !== idx) next[n > idx ? n - 1 : n] = v;
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Functional onChange that accepts updater
  const safeonChange = (updater: ProblemDescriptionState | ((s: ProblemDescriptionState) => ProblemDescriptionState)) => {
    if (typeof updater === "function") {
      onChange(updater(state));
    } else {
      onChange(updater);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mb-8 bg-card border border-border rounded-2xl p-5 md:p-6"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔧</span>
          <h2 className="text-lg font-bold text-foreground">Tell us about the problem</h2>
          <span className="ml-auto text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">Optional</span>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Help the provider understand the issue before they arrive.
        </p>

        {!userId && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20">
            <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-warning">
              Sign in to save attachments. Files are kept in memory and will be uploaded after you log in.
            </p>
          </div>
        )}

        <div className="space-y-5">
          {/* ── Audio ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mic className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Voice Description</span>
              <span className="text-xs text-muted-foreground">(max 60 s)</span>
            </div>
            <AudioRecorder
              audio={state.audio}
              uploading={audioUploading}
              onRecord={(blob, mimeType, duration) => void handleRecord(blob, mimeType, duration)}
              onDelete={() => void handleDeleteAudio()}
            />
          </div>

          <div className="border-t border-border" />

          {/* ── Images ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Camera className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Problem Photos</span>
              <span className="text-xs text-muted-foreground">(up to {MAX_IMAGES}, 5 MB each)</span>
            </div>
            <ImageUploader
              images={state.images}
              uploading={imageUploading}
              errors={imageErrors}
              onAdd={(files) => void handleAddImages(files)}
              onRemove={(idx) => void handleRemoveImage(idx)}
            />
          </div>

          <div className="border-t border-border" />

          {/* ── Text note ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-foreground">📝 Quick Note</span>
            </div>
            <div className="relative">
              <Textarea
                value={state.note}
                onChange={(e) => {
                  const val = e.target.value.slice(0, MAX_NOTE_CHARS);
                  safeonChange({ ...state, note: val });
                }}
                placeholder="Describe the problem in a few words… e.g. 'AC making loud noise and not cooling properly'"
                className="bg-secondary border-border rounded-xl min-h-[80px] resize-none pr-16"
                maxLength={MAX_NOTE_CHARS}
              />
              <span className={`absolute bottom-2 right-3 text-[11px] ${
                state.note.length >= MAX_NOTE_CHARS - 20 ? "text-warning" : "text-muted-foreground"
              }`}>
                {state.note.length}/{MAX_NOTE_CHARS}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
