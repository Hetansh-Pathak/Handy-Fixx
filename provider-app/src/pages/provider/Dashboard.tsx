import React, { useEffect, useState, useCallback } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, Star, Briefcase, TrendingUp, Clock, MapPin, CheckCircle2 } from 'lucide-react';
import LockedPage from '@/components/provider/LockedPage';

const statusClasses: Record<string, string> = {
  pending: 'bg-warning/20 text-warning',
  confirmed: 'bg-primary/20 text-primary',
  in_progress: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-success/20 text-success',
  cancelled: 'bg-destructive/20 text-destructive',
};

const Dashboard: React.FC = () => {
  const { provider } = useProvider();
  const navigate = useNavigate();
  const [weeklyData, setWeeklyData] = useState<{ day: string; earnings: number }[]>([]);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [todayStats, setTodayStats] = useState({ jobs: 0, earnings: 0 });

  const fetchWeeklyEarnings = useCallback(async () => {
    if (!provider) return;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const results = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const { data } = await supabase
        .from('provider_earnings')
        .select('provider_amount')
        .eq('provider_id', provider.id)
        .gte('created_at', `${dateStr}T00:00:00`)
        .lte('created_at', `${dateStr}T23:59:59`);
      results.push({
        day: days[d.getDay()],
        earnings: data?.reduce((sum, e) => sum + Number(e.provider_amount), 0) || 0,
      });
    }
    setWeeklyData(results);
  }, [provider]);

  const fetchPending = useCallback(async () => {
    if (!provider) return;
    const { data } = await (supabase as any)
      .from('bookings')
      .select('*, services(name, icon_name, duration_minutes)')
      // customer_name & customer_phone are now direct columns on bookings
      .eq('provider_id', provider.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);
    setPendingBookings(data || []);
  }, [provider]);

  const fetchTodayStats = useCallback(async () => {
    if (!provider) return;
    const today = new Date().toISOString().split('T')[0];
    const { data: todayBookings } = await (supabase as any)
      .from('bookings')
      .select('total_amount')
      .eq('provider_id', provider.id)
      .or(`booking_date.eq.${today},scheduled_date.eq.${today}`)
      .eq('status', 'completed');
    setTodayStats({
      jobs: todayBookings?.length || 0,
      earnings: todayBookings?.reduce((s, b) => s + Number(b.total_amount || 0), 0) || 0,
    });
  }, [provider]);

  useEffect(() => {
    fetchWeeklyEarnings();
    fetchPending();
    fetchTodayStats();
  }, [fetchWeeklyEarnings, fetchPending, fetchTodayStats]);

  useEffect(() => {
    if (!provider) return;
    const channel = supabase.channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings',
          filter: `provider_id=eq.${provider.id}` }, () => { fetchPending(); fetchTodayStats(); fetchWeeklyEarnings(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [provider, fetchPending, fetchTodayStats, fetchWeeklyEarnings]);

  const stats = [
    { label: "Today's Earnings", value: `₹${todayStats.earnings.toLocaleString()}`, icon: DollarSign, color: 'text-primary' },
    { label: 'Rating', value: `${Number(provider?.rating || 0).toFixed(1)} ⭐`, icon: Star, color: 'text-primary' },
    { label: 'Total Jobs', value: provider?.total_jobs || 0, icon: Briefcase, color: 'text-blue-400' },
    { label: 'Acceptance', value: `${Number(provider?.acceptance_rate || 100).toFixed(0)}%`, icon: TrendingUp, color: 'text-success' },
  ];

  if (provider?.kyc_status !== 'approved') {
    return <LockedPage pageName="Dashboard" />;
  }

  return (
    <div className="space-y-6">
      {provider && (
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Welcome back, {provider.full_name}</h1>
          {provider.is_email_verified && <CheckCircle2 className="h-5 w-5 text-green-500" aria-label="Verified Provider" />}
        </div>
      )}
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Weekly Chart */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="glass-card p-4">
            <h3 className="font-semibold mb-4">Weekly Earnings</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData}>
                <XAxis dataKey="day" stroke="hsl(40 6% 55%)" fontSize={12} />
                <YAxis stroke="hsl(40 6% 55%)" fontSize={12} tickFormatter={v => `₹${v}`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(30 5% 12%)', border: '1px solid hsl(30 5% 20%)', borderRadius: '8px', color: 'hsl(40 10% 90%)' }}
                  formatter={(v: number) => [`₹${v}`, 'Earnings']}
                />
                <Bar dataKey="earnings" fill="hsl(45 100% 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Pending Requests */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Pending Requests</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('/provider-panel/bookings')} className="text-primary text-xs">
                View All
              </Button>
            </div>
            {pendingBookings.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No pending requests 🎉</p>
            ) : (
              <div className="space-y-3">
                {pendingBookings.map((b, i) => (
                  <motion.div key={b.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => navigate('/provider-panel/bookings')}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{(b as any).services?.name || 'Service'}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(b.scheduled_date).toLocaleDateString()}</span>
                        {b.scheduled_time && <span>· {b.scheduled_time}</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{b.address || b.city || 'No address'}</span>
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <p className="font-semibold text-sm text-primary">₹{Number(b.total_amount || 0).toLocaleString()}</p>
                      <Badge className={statusClasses[b.status]} variant="secondary">{b.status}</Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
