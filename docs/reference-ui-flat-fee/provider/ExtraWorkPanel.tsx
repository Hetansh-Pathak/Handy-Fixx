import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Clock, Loader2, Plus, Undo2, Wrench, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { inr } from '@/lib/wallet';
import { cn } from '@/lib/utils';

export type BookingExtra = {
  id: string;
  title: string;
  kind: 'labour' | 'parts';
  amount: number;
  status: 'pending' | 'approved' | 'declined' | 'withdrawn';
  photo_path: string | null;
  created_at: string;
};

const statusStyle: Record<BookingExtra['status'], { label: string; cls: string }> = {
  pending: { label: 'Waiting for customer', cls: 'bg-warning/15 text-warning' },
  approved: { label: 'Approved', cls: 'bg-success/15 text-success' },
  declined: { label: 'Declined', cls: 'bg-destructive/15 text-destructive' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-secondary text-muted-foreground' },
};

const REASONS: Record<string, string> = {
  invalid_status: 'Extra work can be added only while you are on the way or working.',
  photo_required: 'Add a photo of the parts bill.',
  invalid_amount: 'Enter an amount between ₹1 and ₹1,00,000.',
  invalid_title: 'Describe the extra work.',
  too_many_pending: 'Wait for the customer to answer the items already sent.',
};

/** Hook: live extra-work items for a booking. */
export function useBookingExtras(bookingId: string) {
  const [extras, setExtras] = useState<BookingExtra[]>([]);
  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('booking_extras')
      .select('id, title, kind, amount, status, photo_path, created_at')
      .eq('booking_id', bookingId)
      .order('created_at');
    setExtras((data ?? []) as BookingExtra[]);
  }, [bookingId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`extras-${bookingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_extras', filter: `booking_id=eq.${bookingId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [bookingId, load]);

  return { extras, reload: load };
}

type Props = { bookingId: string; lockedPrice: number; editable: boolean };

export default function ExtraWorkPanel({ bookingId, lockedPrice, editable }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { extras, reload } = useBookingExtras(bookingId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'labour' | 'parts'>('labour');
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const approved = extras.filter((e) => e.status === 'approved').reduce((s, e) => s + Number(e.amount), 0);
  const pending = extras.filter((e) => e.status === 'pending');

  const reset = () => { setTitle(''); setAmount(''); setKind('labour'); setPhoto(null); };

  const submit = async () => {
    const value = Number(amount);
    if (title.trim().length < 2 || !(value > 0)) {
      toast({ title: 'Add a description and an amount', variant: 'destructive' });
      return;
    }
    if (kind === 'parts' && !photo) {
      toast({ title: 'Bill photo needed', description: 'Parts must have a photo of the bill.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let photoPath: string | null = null;
      if (photo && user) {
        const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        photoPath = `${user.id}/${bookingId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('booking-extras').upload(photoPath, photo, {
          contentType: photo.type || 'image/jpeg', upsert: false,
        });
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
      }
      const { data, error } = await (supabase as any).rpc('add_booking_extra', {
        p_booking_id: bookingId, p_title: title.trim(), p_amount: Math.round(value), p_kind: kind, p_photo_path: photoPath,
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(REASONS[data?.reason] ?? 'Could not add the item.');
      toast({ title: 'Sent to customer', description: 'Nothing is added to the bill until they tap Approve.' });
      setOpen(false);
      reset();
      void reload();
    } catch (e) {
      toast({ title: 'Not sent', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (id: string) => {
    const { data, error } = await (supabase as any).rpc('withdraw_booking_extra', { p_extra_id: id });
    if (error || !data?.ok) {
      toast({ title: 'Could not withdraw', description: error?.message ?? 'The customer already answered.', variant: 'destructive' });
    }
    void reload();
  };

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bill</p>
        {pending.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-warning"><Clock className="h-3 w-3" /> {pending.length} waiting</span>
        )}
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Locked price</span>
          <span className="font-medium">{inr(lockedPrice)}</span>
        </div>
        {extras.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {e.kind === 'parts' ? <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className={cn('truncate', e.status !== 'approved' && e.status !== 'pending' && 'line-through text-muted-foreground')}>{e.title}</span>
              <Badge variant="secondary" className={cn('shrink-0 text-[9px]', statusStyle[e.status].cls)}>{statusStyle[e.status].label}</Badge>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="font-medium">+{inr(e.amount)}</span>
              {editable && e.status === 'pending' && (
                <button type="button" onClick={() => withdraw(e.id)} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Withdraw item">
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
        <div className="flex justify-between border-t border-border pt-1.5 font-bold">
          <span>Customer pays you</span>
          <span className="text-primary">{inr(lockedPrice + approved)}</span>
        </div>
      </div>
      {editable && (
        <Button size="sm" variant="outline" className="mt-3 w-full rounded-xl border-dashed" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add extra work
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle>Add extra work</DialogTitle>
            <DialogDescription>The customer must tap Approve before this is added. The price stays {inr(lockedPrice)} until then.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(['labour', 'parts'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={cn('flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-medium transition',
                  kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                {k === 'labour' ? <Wrench className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                {k === 'labour' ? 'Extra work' : 'Parts'}
              </button>
            ))}
          </div>
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'parts' ? 'e.g. New tap cartridge' : 'e.g. Pipe joint replaced'} />
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Amount in ₹" />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="outline" className="justify-start rounded-xl" onClick={() => fileRef.current?.click()}>
            <Camera className="mr-2 h-4 w-4" />
            {photo ? photo.name : kind === 'parts' ? 'Bill photo (required)' : 'Photo (optional)'}
          </Button>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="gold-gradient text-primary-foreground font-bold" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send for approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
