import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Loader2, Wallet as WalletIcon, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { inr, type FeePreview } from '@/lib/wallet';
import { cn } from '@/lib/utils';

const ACCEPT_WINDOW = 30;

type Props = {
  bookingId: string;
  createdAt: string;
  amount: number;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

/** Earning and fee shown before the pro decides, plus the 30-second response ring. */
export default function RequestActions({ bookingId, createdAt, amount, busy, onAccept, onDecline }: Props) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<FeePreview | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    (supabase as any).rpc('get_booking_fee_preview', { p_booking_id: bookingId }).then(({ data }: { data: FeePreview | null }) => {
      if (alive && data?.ok) setPreview(data);
    });
    return () => { alive = false; };
  }, [bookingId, amount]);

  const elapsed = Math.floor((now - new Date(createdAt).getTime()) / 1000);
  const left = Math.max(0, ACCEPT_WINDOW - elapsed);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [left]);

  const blocked = preview && !preview.can_accept ? preview.accept_block : null;
  const R = 16;
  const C = 2 * Math.PI * R;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3 text-white">
        {left > 0 && (
          <div className="relative h-11 w-11 shrink-0" aria-label={`${left} seconds to respond`}>
            <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
              <circle cx="20" cy="20" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
              <circle cx="20" cy="20" r={R} fill="none" stroke="#FBBF24" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - left / ACCEPT_WINDOW)} className="transition-all duration-1000" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{left}</span>
          </div>
        )}
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wider text-white/60">You earn</p>
          <p className="text-xl font-extrabold text-amber-400">{inr(preview?.earning ?? amount)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/60">HandyFix fee</p>
          <p className="text-sm font-semibold">
            <span className={cn(preview?.waived && 'line-through text-white/50')}>{inr(preview?.fee ?? 0)}</span>
            {preview?.waived && <span className="ml-1.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">waived</span>}
          </p>
          <p className="text-[10px] text-white/50">only after the job</p>
        </div>
      </div>

      {left === 0 && (
        <p className="text-[11px] text-muted-foreground">
          The customer may now be choosing another pro. You can still accept while the request is open.
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onDecline}
          className="shrink-0 rounded-xl border-destructive/30 px-3 text-destructive hover:bg-destructive/10">
          <XCircle className="mr-1 h-4 w-4" /> Decline
        </Button>
        {blocked ? (
          <Button size="sm" className="h-10 flex-1 rounded-xl gold-gradient font-bold text-primary-foreground"
            onClick={() => navigate('/provider-panel/wallet')}>
            <WalletIcon className="mr-1.5 h-4 w-4" /> Top up {inr(blocked.topup)} to accept
          </Button>
        ) : (
          <Button size="sm" className="h-10 flex-1 rounded-xl gold-gradient font-bold text-primary-foreground"
            disabled={busy} onClick={onAccept}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="mr-1.5 h-4 w-4" /> Accept</>}
          </Button>
        )}
      </div>
      <p className="text-center text-[10px] text-muted-foreground">Declining or missing a request costs ₹0.</p>
    </div>
  );
}
