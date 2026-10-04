import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, ImageIcon, Loader2, ExternalLink, Paperclip, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RawAttachment = {
  id: string;
  type: 'image' | 'audio';
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  created_at: string;
};

type ResolvedAttachment = RawAttachment & { signedUrl: string; signedError?: string };

const BUCKET = 'booking-attachments';
const SIGNED_URL_EXPIRY = 3600;

// ── Attachment counts cache (booking_id → raw rows, NO signed URLs) ───────────
// Used for badges without downloading files.
const rawCache: Map<string, RawAttachment[]> = new Map();

// ── Hook: fetch attachment ROWS only (no signed URLs) ─────────────────────────
export function useBookingAttachments(bookingId: string, enabled = true) {
  const [attachments, setAttachments] = useState<RawAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    if (!enabled || !bookingId) return;

    // Check cache first — ONLY use cache if it has rows
    if (rawCache.has(bookingId) && (rawCache.get(bookingId)?.length ?? 0) > 0) {
      setAttachments(rawCache.get(bookingId)!);
      return;
    }

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
      }).from('booking_attachments')
        .select('id, type, storage_path, mime_type, size_bytes, duration_seconds, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        console.error('[AttachmentViewer] fetch error:', fetchError.message);
        throw new Error(fetchError.message);
      }

      const rows = data || [];
      if (rows.length > 0) {
        rawCache.set(bookingId, rows);
      } else {
        rawCache.delete(bookingId);
      }
      setAttachments(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load attachments';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [bookingId, enabled]);

  useEffect(() => {
    void fetchRows();

    if (!enabled || !bookingId) return;

    // Realtime listener for newly linked attachments for this booking
    const channel = supabase.channel(`att-realtime-${bookingId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_attachments',
        filter: `booking_id=eq.${bookingId}`,
      }, () => {
        rawCache.delete(bookingId);
        void fetchRows();
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [bookingId, enabled, fetchRows]);

  const hasAudio = attachments.some(a => a.type === 'audio');
  const hasImages = attachments.some(a => a.type === 'image');
  const hasSomething = attachments.length > 0;

  return {
    attachments,
    loading,
    error,
    hasAudio,
    hasImages,
    hasSomething,
    refetch: () => {
      rawCache.delete(bookingId);
      void fetchRows();
    },
  };
}

// ── Helper: sign all URLs for a set of raw attachments ───────────────────────
async function signAttachments(raws: RawAttachment[]): Promise<ResolvedAttachment[]> {
  if (raws.length === 0) return [];

  const paths = raws.map(a => a.storage_path);
  try {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_EXPIRY);

    return raws.map((raw, i) => {
      const url = signed?.[i]?.signedUrl ?? '';
      return {
        ...raw,
        signedUrl: url,
        signedError: url ? undefined : 'Could not load file',
      };
    });
  } catch {
    return raws.map(raw => ({ ...raw, signedUrl: '', signedError: 'Signing failed' }));
  }
}

// ── Badge chip ────────────────────────────────────────────────────────────────
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

// ── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({
  images,
  startIndex,
  onClose,
}: {
  images: ResolvedAttachment[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);

  const prev = () => { setIndex(i => (i - 1 + images.length) % images.length); setZoom(1); };
  const next = () => { setIndex(i => (i + 1) % images.length); setZoom(1); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const current = images[index];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-black/95 border-border max-w-4xl p-0 gap-0" aria-label="Photo lightbox">
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <span className="text-xs text-white/60">{index + 1} / {images.length}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Reset zoom"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(3, z + 0.25))}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close lightbox"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="relative flex items-center justify-center min-h-[300px] max-h-[70vh] overflow-hidden">
          {current.signedUrl ? (
            <img
              src={current.signedUrl}
              alt={`Problem photo ${index + 1}`}
              className="max-w-full max-h-[70vh] object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})` }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/40 p-8">
              <AlertCircle className="w-10 h-10" />
              <p className="text-sm">Could not load photo</p>
            </div>
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
                aria-label="Next photo"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex justify-center gap-1.5 p-3 border-t border-white/10">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setIndex(i); setZoom(1); }}
                className={`w-2 h-2 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/25'}`}
                aria-label={`Go to photo ${i + 1}`}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Problem Details Dialog ─────────────────────────────────────────────────────
type ProblemDetailsDialogProps = {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  note?: string | null;
  serviceName?: string;
  subItemName?: string | null;
  shortId?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  showActions?: boolean;
  actionLoading?: boolean;
};

export function ProblemDetailsDialog({
  open,
  onClose,
  bookingId,
  note,
  serviceName,
  subItemName,
  shortId,
  onAccept,
  onDecline,
  showActions = false,
  actionLoading = false,
}: ProblemDetailsDialogProps) {
  const [resolved, setResolved] = useState<ResolvedAttachment[]>([]);
  const [signing, setSigning] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [lightboxStart, setLightboxStart] = useState<number | null>(null);
  const { attachments: rawRows, loading: rowsLoading } = useBookingAttachments(bookingId, open);
  const hasSigned = useRef(false);

  // Lazily resolve signed URLs when dialog opens
  useEffect(() => {
    if (!open || hasSigned.current || rawRows.length === 0) return;
    hasSigned.current = true;
    setSigning(true);
    setSigningError(null);
    signAttachments(rawRows).then(res => {
      setResolved(res);
      setSigning(false);
    }).catch(e => {
      setSigningError(e instanceof Error ? e.message : 'Failed to load files');
      setSigning(false);
    });
  }, [open, rawRows]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      hasSigned.current = false;
      setResolved([]);
      setSigningError(null);
    }
  }, [open]);

  const audioAtts = resolved.filter(a => a.type === 'audio');
  const imageAtts = resolved.filter(a => a.type === 'image');
  const hasNote = Boolean(note?.trim());
  const hasContent = hasNote || rawRows.length > 0;

  const title = serviceName
    ? `Problem Details — ${serviceName}${subItemName ? ` → ${subItemName}` : ''}${shortId ? ` · #${shortId}` : ''}`
    : 'Problem Details';

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="bg-card border-border max-w-xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-5 pb-0 flex-shrink-0">
            <DialogTitle className="text-foreground text-base leading-snug">{title}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Loading rows */}
            {rowsLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading details…
              </div>
            )}

            {/* Signing URLs */}
            {signing && !rowsLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading media…
              </div>
            )}

            {/* No content */}
            {!rowsLoading && !hasContent && (
              <div className="text-center py-8 text-muted-foreground">
                <Paperclip className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Customer didn't add problem details</p>
              </div>
            )}

            {/* Text Note */}
            {hasNote && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">📝 Customer Note</p>
                <p className="text-sm text-foreground bg-secondary/60 rounded-xl px-4 py-3 leading-relaxed whitespace-pre-wrap border border-border">
                  {note}
                </p>
              </div>
            )}

            {/* Audio Player(s) */}
            {!signing && audioAtts.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🎤 Voice Note</p>
                {audioAtts.map((att) => (
                  <div key={att.id} className="space-y-1.5">
                    {att.duration_seconds && (
                      <p className="text-xs text-muted-foreground">
                        Duration: {Math.floor(att.duration_seconds / 60).toString().padStart(2, '0')}:{(att.duration_seconds % 60).toString().padStart(2, '0')}
                      </p>
                    )}
                    {att.signedUrl ? (
                      <audio
                        src={att.signedUrl}
                        controls
                        className="w-full h-10 rounded-xl"
                        style={{ accentColor: 'var(--color-primary, #d4af37)' }}
                        aria-label="Customer voice note"
                      />
                    ) : (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {att.signedError ?? 'Could not load audio'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Photos */}
            {!signing && imageAtts.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">📷 Photos ({imageAtts.length})</p>
                <div className="grid grid-cols-3 gap-2">
                  {imageAtts.map((att, idx) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => setLightboxStart(idx)}
                      className="relative group rounded-xl overflow-hidden border border-border aspect-square hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-label={`View photo ${idx + 1} of ${imageAtts.length}`}
                    >
                      {att.signedUrl ? (
                        <>
                          <img
                            src={att.signedUrl}
                            alt={`Problem photo ${idx + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                            <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full bg-secondary flex items-center justify-center">
                          <AlertCircle className="w-5 h-5 text-muted-foreground/40" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Signing error */}
            {signingError && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {signingError}
              </p>
            )}

            {/* Raw rows loaded but signing not started yet — show skeleton */}
            {!rowsLoading && rawRows.length > 0 && !signing && resolved.length === 0 && !signingError && (
              <div className="space-y-2">
                {[...Array(Math.min(rawRows.length, 3))].map((_, i) => (
                  <div key={i} className="h-10 bg-secondary rounded-xl animate-pulse" />
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          {showActions && (onAccept || onDecline) && (
            <div className="flex gap-2 p-4 border-t border-border flex-shrink-0">
              {onDecline && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 rounded-xl"
                  onClick={() => { onClose(); onDecline(); }}
                  disabled={actionLoading}
                >
                  Decline
                </Button>
              )}
              {onAccept && (
                <Button
                  size="sm"
                  className="flex-1 gold-gradient text-primary-foreground font-bold rounded-xl"
                  onClick={() => { onClose(); onAccept(); }}
                  disabled={actionLoading}
                >
                  Accept Booking
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {lightboxStart !== null && imageAtts.length > 0 && (
        <Lightbox
          images={imageAtts}
          startIndex={lightboxStart}
          onClose={() => setLightboxStart(null)}
        />
      )}
    </>
  );
}

// ── Inline viewer (card-embedded, lazy) ───────────────────────────────────────
type Props = {
  bookingId: string;
  note?: string | null;
  lazy?: boolean;
  visible?: boolean;
};

export default function AttachmentViewer({ bookingId, note, lazy = false, visible = true }: Props) {
  const { attachments: rawRows, loading, error } = useBookingAttachments(
    bookingId,
    lazy ? visible : true,
  );
  const [resolved, setResolved] = useState<ResolvedAttachment[]>([]);
  const [signing, setSigning] = useState(false);
  const [lightboxStart, setLightboxStart] = useState<number | null>(null);
  const hasSigned = useRef(false);

  useEffect(() => {
    if (hasSigned.current || rawRows.length === 0) return;
    hasSigned.current = true;
    setSigning(true);
    signAttachments(rawRows).then(res => {
      setResolved(res);
      setSigning(false);
    }).catch(() => setSigning(false));
  }, [rawRows]);

  if (loading || signing) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading attachments…
      </div>
    );
  }

  const hasNote = Boolean(note?.trim());
  if (error) {
    return hasNote ? (
      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs font-medium text-foreground mb-1">📝 Customer Note</p>
        <p className="text-sm text-muted-foreground bg-secondary rounded-lg px-3 py-2 leading-relaxed">{note}</p>
      </div>
    ) : null;
  }

  if (resolved.length === 0 && !hasNote) return null;

  const audioAtts = resolved.filter(a => a.type === 'audio');
  const imageAtts = resolved.filter(a => a.type === 'image');

  return (
    <>
      <div className="space-y-4 p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Customer's Problem Description
        </p>

        {audioAtts.map((att) => (
          <div key={att.id}>
            <div className="flex items-center gap-1.5 mb-1">
              <Mic className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">Voice Note</span>
              {att.duration_seconds && (
                <span className="text-xs text-muted-foreground">
                  ({Math.floor(att.duration_seconds / 60).toString().padStart(2, '0')}:
                  {(att.duration_seconds % 60).toString().padStart(2, '0')})
                </span>
              )}
            </div>
            <audio
              src={att.signedUrl}
              controls
              className="w-full h-9 rounded-lg"
            />
          </div>
        ))}

        {imageAtts.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <ImageIcon className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">Photos ({imageAtts.length})</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {imageAtts.map((att, idx) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => setLightboxStart(idx)}
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

        {hasNote && (
          <div>
            <p className="text-xs font-medium text-foreground mb-1">📝 Customer Note</p>
            <p className="text-sm text-muted-foreground bg-secondary rounded-lg px-3 py-2 leading-relaxed">
              {note}
            </p>
          </div>
        )}
      </div>

      {lightboxStart !== null && imageAtts.length > 0 && (
        <Lightbox
          images={imageAtts}
          startIndex={lightboxStart}
          onClose={() => setLightboxStart(null)}
        />
      )}
    </>
  );
}
