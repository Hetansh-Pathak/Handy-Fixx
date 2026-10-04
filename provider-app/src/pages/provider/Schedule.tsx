import React, { useEffect, useState, useCallback } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { motion } from 'framer-motion';
import { Plus, Trash2, Copy, Clock } from 'lucide-react';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

interface Slot {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  is_available: boolean | null;
}

const Schedule: React.FC = () => {
  const { provider } = useProvider();
  const { toast } = useToast();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [todayBookings, setTodayBookings] = useState<any[]>([]);

  const fetchSlots = useCallback(async () => {
    if (!provider) return;
    const { data } = await supabase
      .from('provider_availability')
      .select('*')
      .eq('provider_id', provider.id)
      .order('start_time');
    setSlots((data || []) as Slot[]);
  }, [provider]);

  const fetchTodayBookings = useCallback(async () => {
    if (!provider) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('bookings')
      .select('*, services(name, duration_minutes)')
      .eq('provider_id', provider.id)
      .eq('scheduled_date', today)
      .in('status', ['confirmed', 'in_progress']);
    setTodayBookings(data || []);
  }, [provider]);

  useEffect(() => { fetchSlots(); fetchTodayBookings(); }, [fetchSlots, fetchTodayBookings]);

  useEffect(() => {
    if (!provider) return;
    const channel = supabase.channel('schedule-today')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings',
          filter: `provider_id=eq.${provider.id}` }, () => fetchTodayBookings())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [provider, fetchTodayBookings]);

  const addSlot = async (day: string) => {
    if (!provider) return;
    const { error } = await supabase.from('provider_availability').insert({
      provider_id: provider.id, day_of_week: day, start_time: '09:00', end_time: '17:00', is_available: true,
    });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Slot added' }); fetchSlots(); }
  };

  const deleteSlot = async (id: string) => {
    await supabase.from('provider_availability').delete().eq('id', id);
    fetchSlots();
  };

  const updateSlot = async (id: string, field: string, value: any) => {
    await supabase.from('provider_availability').update({ [field]: value }).eq('id', id);
    fetchSlots();
  };

  const copyToWeekdays = async (sourceDay: string) => {
    if (!provider) return;
    const sourceSlots = slots.filter(s => s.day_of_week === sourceDay);
    if (sourceSlots.length === 0) { toast({ title: 'No slots to copy', variant: 'destructive' }); return; }
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    for (const day of weekdays.filter(d => d !== sourceDay)) {
      // Delete existing slots for this day
      await supabase.from('provider_availability').delete().eq('provider_id', provider.id).eq('day_of_week', day);
      for (const slot of sourceSlots) {
        await supabase.from('provider_availability').insert({
          provider_id: provider.id, day_of_week: day, start_time: slot.start_time, end_time: slot.end_time, is_available: true,
        });
      }
    }
    fetchSlots();
    toast({ title: 'Schedule copied to all weekdays ✅' });
  };

  return (
    <div className="space-y-6">
      {/* Today's bookings */}
      {todayBookings.length > 0 && (
        <Card className="glass-card p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Today's Bookings</h3>
          <div className="space-y-2">
            {todayBookings.map(b => (
              <div key={b.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 text-sm">
                <span className="font-medium">{b.services?.name || 'Service'}</span>
                <span className="text-muted-foreground">{b.scheduled_time || 'TBD'}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Weekly Schedule */}
      <div className="space-y-4">
        {DAYS.map((day, di) => {
          const daySlots = slots.filter(s => s.day_of_week === day);
          return (
            <motion.div key={day} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: di * 0.05 }}>
              <Card className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">{DAY_LABELS[day]}</h4>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => copyToWeekdays(day)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy to weekdays
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => addSlot(day)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {daySlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No slots — day off</p>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map(slot => (
                      <div key={slot.id} className="flex items-center gap-3">
                        <Switch
                          checked={slot.is_available || false}
                          onCheckedChange={v => updateSlot(slot.id, 'is_available', v)}
                          className="data-[state=checked]:bg-success"
                        />
                        <Input type="time" value={slot.start_time} onBlur={e => updateSlot(slot.id, 'start_time', e.target.value)}
                          onChange={e => { const newSlots = [...slots]; const idx = newSlots.findIndex(s => s.id === slot.id); if (idx >= 0) { newSlots[idx] = { ...newSlots[idx], start_time: e.target.value }; setSlots(newSlots); } }}
                          className="w-28 h-8 glass-input text-sm" />
                        <span className="text-muted-foreground">to</span>
                        <Input type="time" value={slot.end_time} onBlur={e => updateSlot(slot.id, 'end_time', e.target.value)}
                          onChange={e => { const newSlots = [...slots]; const idx = newSlots.findIndex(s => s.id === slot.id); if (idx >= 0) { newSlots[idx] = { ...newSlots[idx], end_time: e.target.value }; setSlots(newSlots); } }}
                          className="w-28 h-8 glass-input text-sm" />
                        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => deleteSlot(slot.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default Schedule;
