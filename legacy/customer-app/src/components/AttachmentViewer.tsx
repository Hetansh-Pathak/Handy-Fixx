import { useCallback, useEffect, useState } from "react";
import { Mic, ImageIcon, Loader2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type RawAttachment = {
  id: string;
  type: "image" | "audio";
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  created_at: string;
};

type ResolvedAttachment = RawAttachment & { signedUrl: string };

type Props = {
  bookingId: string;
  /** If provided, also show the customer's text note */
  note?: string | null;
  /** Force lazy mode: only fetch when `visible` becomes true */
  lazy?: boolean;
  visible?: boolean;
};

const BUCKET = "booking-attachments";
const SIGNED_URL_EXPIRY = 3600; // 1 hour

// ── Hook: useBookingAttachments ───────────────────────────────────────────────

export function useBookingAttachments(bookingId: string, enabled = true) {
  const [attachments, setAttachments] = useState<ResolvedAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!enabled || !bookingId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              order: (col: string, opts: { ascending: boolean }) => Promise<{ data: RawAttachment[] | null; error: { message: string } | null }>;
            };
          };
        };
      }).from("booking_attachments")
        .select("id, type, storage_path, mime_type, size_bytes, duration_seconds, created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });

      if (fetchError) throw new Error(fetchError.message);
      if (!data || data.length === 0) { setAttachments([]); return; }

      // Resolve signed URLs for each attachment
      const resolved = await Promise.all(
        data.map(async (att) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(att.storage_path, SIGNED_URL_EXPIRY);
          return { ...att, signedUrl: signed?.signedUrl ?? "" };
        }),
      );

      setAttachments(resolved.filter(a => a.signedUrl));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attachments");
    } finally {
      setLoading(false);
    }
  }, [bookingId, enabled]);

  useEffect(() => { void fetch(); }, [fetch]);

  const hasAudio = attachments.some(a => a.type === "audio");
  const hasImages = attachments.some(a => a.type === "image");
  const hasSomething = attachments.length > 0;

  return { attachments, loading, error, hasAudio, hasImages, hasSomething, refetch: fetch };
}

// ── Badge chip (collapsed card) ───────────────────────────────────────────────

export function AttachmentBadges({
  hasAudio,
  hasImages,
  imageCount,
}: {
  hasAudio: boolean;
  hasImages: boolean;
  imageCount: number;
}) {
  if (!hasAudio && !hasImages) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
      {hasAudio && <span title="Voice note">🎤</span>}
      {hasImages && <span title={`${imageCount} photo(s)`}>📷 {imageCount}</span>}
    </span>
  );
}

// ── Full viewer component ─────────────────────────────────────────────────────

export default function AttachmentViewer({ bookingId, note, lazy = false, visible = true }: Props) {
  const { attachments, loading, error, hasSomething } = useBookingAttachments(
    bookingId,
    lazy ? visible : true,
  );
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading attachments…
      </div>
    );
  }

  const hasNote = Boolean(note && note.trim().length > 0);

  if (error) {
    // If table not created in Supabase yet, suppress raw database error
    return hasNote ? (
      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs font-medium text-foreground mb-1">📝 Customer Note</p>
        <p className="text-sm text-muted-foreground bg-secondary rounded-lg px-3 py-2 leading-relaxed">{note}</p>
      </div>
    ) : null;
  }

  if (!hasSomething && !hasNote) return null;

  const audioAtts = attachments.filter(a => a.type === "audio");
  const imageAtts = attachments.filter(a => a.type === "image");

  return (
    <>
      <div className="space-y-4 p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Customer's Problem Description
        </p>

        {/* Audio player(s) */}
        {audioAtts.map((att) => (
          <div key={att.id}>
            <div className="flex items-center gap-1.5 mb-1">
              <Mic className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">Voice Note</span>
              {att.duration_seconds && (
                <span className="text-xs text-muted-foreground">
                  ({Math.floor(att.duration_seconds / 60).toString().padStart(2, "0")}:
                  {(att.duration_seconds % 60).toString().padStart(2, "0")})
                </span>
              )}
            </div>
            <audio
              src={att.signedUrl}
              controls
              className="w-full h-9 rounded-lg"
              style={{ accentColor: "var(--color-primary, #d4af37)" }}
            />
          </div>
        ))}

        {/* Image thumbnails */}
        {imageAtts.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <ImageIcon className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">
                Photos ({imageAtts.length})
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {imageAtts.map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => setLightboxUrl(att.signedUrl)}
                  className="relative group rounded-xl overflow-hidden border border-border aspect-square hover:border-primary/40 transition-colors"
                  aria-label="View full size photo"
                >
                  <img
                    src={att.signedUrl}
                    alt="Customer problem photo"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text note */}
        {hasNote && (
          <div>
            <p className="text-xs font-medium text-foreground mb-1">📝 Customer Note</p>
            <p className="text-sm text-muted-foreground bg-secondary rounded-lg px-3 py-2 leading-relaxed">
              {note}
            </p>
          </div>
        )}
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="bg-card border-border max-w-2xl p-2">
          <DialogHeader className="px-4 pt-3 pb-2">
            <DialogTitle className="text-sm text-muted-foreground">Problem Photo</DialogTitle>
          </DialogHeader>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Full size problem photo"
              className="w-full rounded-xl object-contain max-h-[70vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
