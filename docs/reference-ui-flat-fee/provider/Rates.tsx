import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, IndianRupee, Info, Loader2, RotateCcw, Tag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useProvider } from '@/contexts/ProviderContext';
import { useToast } from '@/hooks/use-toast';
import { flatFeeFor, inr } from '@/lib/wallet';
import LockedPage from '@/components/provider/LockedPage';
import { cn } from '@/lib/utils';

type Item = {
  key: string;
  serviceId: string;
  subItemId: string | null;
  serviceName: string;
  name: string;
  base: number;
  min: number;
  max: number;
};

const keyOf = (serviceId: string, subItemId: string | null) => `${serviceId}:${subItemId ?? ''}`;

const Rates: React.FC = () => {
  const { provider } = useProvider();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const serviceIds = useMemo(
    () => ((provider as unknown as { service_ids?: string[] | null })?.service_ids ?? []),
    [provider],
  );

  const load = useCallback(async () => {
    if (!provider?.id) return;
    setLoading(true);
    const sb = supabase as any;
    let svcQuery = sb.from('services').select('id, name, base_price, price_min, price_max').eq('is_active', true).order('name');
    if (serviceIds.length > 0) svcQuery = svcQuery.in('id', serviceIds);
    const [{ data: services }, { data: rates }] = await Promise.all([
      svcQuery,
      sb.from('provider_rates').select('service_id, sub_item_id, price').eq('provider_id', provider.id),
    ]);
    const ids = (services ?? []).map((s: { id: string }) => s.id);
    const { data: subs } = ids.length
      ? await sb.from('service_sub_items').select('id, service_id, name, base_price, price_min, price_max')
          .in('service_id', ids).eq('is_active', true).order('sort_order')
      : { data: [] };

    const list: Item[] = [];
    for (const s of services ?? []) {
      const base = Number(s.base_price ?? 0);
      list.push({
        key: keyOf(s.id, null), serviceId: s.id, subItemId: null, serviceName: s.name, name: 'Standard visit',
        base, min: Number(s.price_min ?? base), max: Number(s.price_max ?? base),
      });
      for (const sub of (subs ?? []).filter((x: { service_id: string }) => x.service_id === s.id)) {
        const sb2 = Number(sub.base_price ?? 0);
        list.push({
          key: keyOf(s.id, sub.id), serviceId: s.id, subItemId: sub.id, serviceName: s.name, name: sub.name,
          base: sb2, min: Number(sub.price_min ?? sb2), max: Number(sub.price_max ?? sb2),
        });
      }
    }
    const map: Record<string, number> = {};
    for (const r of rates ?? []) map[keyOf(r.service_id, r.sub_item_id)] = Number(r.price);
    setItems(list.filter((i) => i.base > 0));
    setSaved(map);
    setDraft({});
    setLoading(false);
  }, [provider?.id, serviceIds]);

  useEffect(() => { void load(); }, [load]);

  if (provider?.kyc_status !== 'approved') return <LockedPage pageName="My rates" />;

  const save = async (item: Item, price: number | null) => {
    setSavingKey(item.key);
    const { data, error } = await (supabase as any).rpc('set_provider_rate', {
      p_service_id: item.serviceId, p_sub_item_id: item.subItemId, p_price: price,
    });
    setSavingKey(null);
    if (error || !data?.ok) {
      const msg = data?.reason === 'outside_band'
        ? `Pick a price between ${inr(data.min)} and ${inr(data.max)}.`
        : error?.message ?? 'Please try again.';
      toast({ title: 'Rate not saved', description: msg, variant: 'destructive' });
      return;
    }
    setSaved((prev) => {
      const next = { ...prev };
      if (price === null) delete next[item.key]; else next[item.key] = price;
      return next;
    });
    setDraft((prev) => { const next = { ...prev }; delete next[item.key]; return next; });
    toast({ title: price === null ? 'Back to catalogue price' : `Rate saved: ${inr(price)}`, description: 'New bookings use this price.' });
  };

  const groups = items.reduce<Record<string, Item[]>>((acc, i) => {
    (acc[i.serviceName] ??= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="text-xl font-bold">My rates</h1>
        <p className="text-sm text-muted-foreground">
          HandyFix sets a fair range for each job. Pick your price inside it. Customers see exactly this price, locked at booking.
        </p>
      </div>

      <Card className="flex items-start gap-2 rounded-2xl border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        Extra work on site is added in the job screen and the customer approves it with one tap. Your flat fee depends on the final service bill, never a percentage.
      </Card>

      {serviceIds.length === 0 && !loading && (
        <Card className="glass-card rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">Select the services you offer in your profile first.</p>
          <Button className="mt-3 gold-gradient text-primary-foreground font-bold" onClick={() => navigate('/provider-panel/profile')}>
            Open profile
          </Button>
        </Card>
      )}

      {loading ? (
        [...Array(3)].map((_, i) => <div key={i} className="h-36 glass-card rounded-2xl animate-pulse" />)
      ) : Object.entries(groups).map(([serviceName, list]) => (
        <section key={serviceName} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Tag className="h-3.5 w-3.5" /> {serviceName}
          </h2>
          {list.map((item) => {
            const current = draft[item.key] ?? saved[item.key] ?? item.base;
            const dirty = draft[item.key] !== undefined && draft[item.key] !== (saved[item.key] ?? item.base);
            const custom = saved[item.key] !== undefined;
            const span = Math.max(1, item.max - item.min);
            const step = span >= 200 ? 10 : 5;
            return (
              <Card key={item.key} className="glass-card rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Band {inr(item.min)} – {inr(item.max)} · catalogue {inr(item.base)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end text-2xl font-extrabold text-primary">
                      <IndianRupee className="h-5 w-5" />{current.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">fee after job {inr(flatFeeFor(current))}</p>
                  </div>
                </div>

                {item.max > item.min && (
                  <div className="mt-4">
                    <Slider
                      min={item.min}
                      max={item.max}
                      step={step}
                      value={[current]}
                      onValueChange={([v]) => setDraft((prev) => ({ ...prev, [item.key]: v }))}
                      aria-label={`Price for ${item.name}`}
                    />
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className={cn('text-[11px] font-medium', custom ? 'text-success' : 'text-muted-foreground')}>
                    {custom ? 'Your rate is live' : 'Using catalogue price'}
                  </span>
                  <div className="flex gap-2">
                    {custom && (
                      <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={savingKey === item.key}
                        onClick={() => save(item, null)}>
                        <RotateCcw className="mr-1 h-3 w-3" /> Reset
                      </Button>
                    )}
                    <Button size="sm" className="h-8 rounded-lg gold-gradient text-xs font-bold text-primary-foreground"
                      disabled={!dirty || savingKey === item.key} onClick={() => save(item, current)}>
                      {savingKey === item.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="mr-1 h-3 w-3" /> Save</>}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
};

export default Rates;
