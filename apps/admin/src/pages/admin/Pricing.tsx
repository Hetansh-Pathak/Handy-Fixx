import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const sb = supabase as any;
const inr = (n: number | string | null | undefined) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

type Row = {
  serviceId: string;
  subItemId: string | null;
  serviceName: string;
  name: string;
  base: number;
  min: number | null;
  max: number | null;
};

/** Admin sets the band (min / catalogue / max) for every service and sub-service. */
const AdminPricing: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState({ min: '', base: '', max: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: services, error }, { data: subs }] = await Promise.all([
      sb.from('services').select('*').order('name'),
      sb.from('service_sub_items').select('*').order('sort_order'),
    ]);
    if (error) toast({ title: 'Could not load services', description: error.message, variant: 'destructive' });
    const list: Row[] = [];
    for (const s of services ?? []) {
      list.push({ serviceId: s.id, subItemId: null, serviceName: s.name, name: 'Standard visit', base: Number(s.base_price ?? 0), min: s.price_min, max: s.price_max });
      for (const x of (subs ?? []).filter((y: { service_id: string }) => y.service_id === s.id)) {
        list.push({ serviceId: s.id, subItemId: x.id, serviceName: s.name, name: x.name, base: Number(x.base_price ?? 0), min: x.price_min, max: x.price_max });
      }
    }
    setRows(list);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const open = (r: Row) => {
    setEdit(r);
    setForm({ min: String(r.min ?? r.base), base: String(r.base), max: String(r.max ?? r.base) });
  };

  const save = async () => {
    if (!edit) return;
    const min = Number(form.min), base = Number(form.base), max = Number(form.max);
    if (!(min > 0) || !(min <= base && base <= max)) {
      toast({ title: 'Check the numbers', description: 'Need 0 < min ≤ catalogue price ≤ max.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data, error } = await sb.rpc('admin_set_price_band', {
      p_service_id: edit.serviceId, p_sub_item_id: edit.subItemId, p_base: base, p_min: min, p_max: max,
    });
    setSaving(false);
    if (error || !data?.success) {
      toast({ title: 'Not saved', description: error?.message ?? data?.error ?? 'Try again', variant: 'destructive' });
      return;
    }
    toast({ title: 'Band saved', description: `${edit.name}: ${inr(min)} – ${inr(max)}. Pro rates outside it are clamped.` });
    setEdit(null);
    void load();
  };

  const groups = rows.reduce<Record<string, Row[]>>((acc, r) => { (acc[r.serviceName] ??= []).push(r); return acc; }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Price bands</h1>
        <p className="text-sm text-muted-foreground">
          Pros pick their rate inside the band. Customers see one price, locked at booking. Anything outside the band is refused, so there are no bidding wars.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : Object.entries(groups).map(([service, list]) => (
        <Card key={service} className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-4 py-2.5 text-sm font-semibold">
            <Tag className="h-4 w-4 text-primary" /> {service}
          </div>
          <div className="divide-y divide-border">
            {list.map((r) => {
              const min = r.min ?? r.base, max = r.max ?? r.base;
              const span = Math.max(1, max - min);
              return (
                <div key={`${r.serviceId}:${r.subItemId ?? ''}`} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-48 min-w-0 shrink-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">catalogue {inr(r.base)}</p>
                  </div>
                  <div className="hidden flex-1 sm:block">
                    <div className="relative h-7 overflow-hidden rounded-full bg-red-500/10">
                      <div className="absolute inset-y-0 left-[15%] right-[15%] rounded-full bg-amber-400/80" />
                      <div className="absolute inset-y-0 w-0.5 bg-zinc-900 dark:bg-white"
                        style={{ left: `calc(15% + ${((r.base - min) / span) * 70}%)` }} />
                      <span className="absolute inset-y-0 left-[16%] flex items-center text-[11px] font-semibold text-zinc-900">{inr(min)}</span>
                      <span className="absolute inset-y-0 right-[16%] flex items-center text-[11px] font-semibold text-zinc-900">{inr(max)}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => open(r)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <Dialog open={!!edit} onOpenChange={(v) => { if (!v) setEdit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{edit?.serviceName} · {edit?.name}</DialogTitle>
            <DialogDescription>Set the band from local market research. The catalogue price is used when a pro has not set a rate.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {(['min', 'base', 'max'] as const).map((k) => (
              <label key={k} className="text-xs text-muted-foreground">
                {k === 'base' ? 'Catalogue' : k === 'min' ? 'Minimum' : 'Maximum'}
                <Input className="mt-1" inputMode="numeric" value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/\D/g, '') }))} />
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save band'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPricing;
