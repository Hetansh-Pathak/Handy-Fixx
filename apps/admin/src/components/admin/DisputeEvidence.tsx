import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { describeArrival, mapsLink, type ArrivalEvidence } from '@handyfix/shared';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);

type ChatLine = { sender: string; text: string; at: string };
type Evidence = {
  arrival: ArrivalEvidence;
  arrivalLat: unknown;
  arrivalLng: unknown;
  trip: { lat: unknown; lng: unknown; at: string | null } | null;
  chat: ChatLine[];
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN') : '—');

/** Reads the admin_booking_evidence reply defensively: nothing here may break the dispute dialog. */
function parseEvidence(data: unknown): Evidence | null {
  if (!isRecord(data) || data.success !== true) return null;
  const arrival = isRecord(data.arrival) ? data.arrival : {};
  const trip = isRecord(data.last_trip_position) ? data.last_trip_position : null;
  const chat = Array.isArray(data.chat)
    ? data.chat.filter(isRecord).map((m) => ({ sender: String(m.sender ?? ''), text: String(m.text ?? ''), at: String(m.at ?? '') }))
    : [];
  return {
    arrival: describeArrival({ at: arrival.at, lat: arrival.lat, lng: arrival.lng, jobLat: data.job_latitude, jobLng: data.job_longitude }),
    arrivalLat: arrival.lat,
    arrivalLng: arrival.lng,
    trip: trip ? { lat: trip.lat, lng: trip.lng, at: typeof trip.at === 'string' ? trip.at : null } : null,
    chat,
  };
}

/** Arrival record, last live position and the chat for a disputed booking (PDF p.11 auto-evidence). */
const DisputeEvidence: React.FC<{ bookingId: string }> = ({ bookingId }) => {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'unavailable'; message: string } | { kind: 'ok'; evidence: Evidence }>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    rpc('admin_booking_evidence', { p_booking_id: bookingId })
      .then(({ data, error }) => {
        if (cancelled) return;
        const evidence = error ? null : parseEvidence(data);
        if (evidence) setState({ kind: 'ok', evidence });
        else setState({
          kind: 'unavailable',
          message: error ? 'Arrival and chat evidence is not available yet (database update 20261116 not applied).' : 'Arrival and chat evidence could not be loaded for this booking.',
        });
      })
      .catch(() => { if (!cancelled) setState({ kind: 'unavailable', message: 'Arrival and chat evidence could not be loaded.' }); });
    return () => { cancelled = true; };
  }, [bookingId]);

  if (state.kind === 'loading') return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading evidence…</div>;
  if (state.kind === 'unavailable') return <p className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">{state.message}</p>;

  const { evidence: e } = state;
  const arrivalLink = mapsLink(e.arrivalLat, e.arrivalLng);
  const tripLink = e.trip ? mapsLink(e.trip.lat, e.trip.lng) : null;
  return (
    <div className="space-y-3 rounded-lg bg-secondary/50 p-3 text-xs">
      <div>
        <p className="font-semibold">Arrival</p>
        <p className={cn(e.arrival.state === 'far' ? 'text-amber-600' : 'text-muted-foreground')}>
          {'at' in e.arrival ? `${when(e.arrival.at)} · ` : ''}{e.arrival.line}
          {arrivalLink ? <> <a className="text-primary underline" href={arrivalLink} target="_blank" rel="noreferrer">Open on map</a></> : null}
        </p>
      </div>
      <div>
        <p className="font-semibold">Last live trip position</p>
        <p className="text-muted-foreground">
          {e.trip ? `${when(e.trip.at)} ` : 'Not recorded.'}
          {tripLink ? <a className="text-primary underline" href={tripLink} target="_blank" rel="noreferrer">Open on map</a> : null}
        </p>
      </div>
      <div>
        <p className="font-semibold">Chat ({e.chat.length} message{e.chat.length === 1 ? '' : 's'})</p>
        {e.chat.length === 0 ? <p className="text-muted-foreground">No messages.</p> : (
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {e.chat.map((m, i) => (
              <li key={i}><span className="font-medium capitalize">{m.sender || 'unknown'}</span> <span className="text-muted-foreground">{when(m.at)}</span><br />{m.text}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DisputeEvidence;
