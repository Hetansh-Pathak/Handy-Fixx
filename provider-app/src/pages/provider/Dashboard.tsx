import React, { useEffect, useState, useCallback } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { IndianRupee, Star, Briefcase, TrendingUp, Clock, MapPin, CheckCircle2 } from 'lucide-react';
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
  const [weeklyData, setWeeklyData] = useState<{ day: string; earnings: number }[] | null>(null);
  const [pendingBookings, setPendingBookings] = useState<any[] | null>(null);
  const [todayStats, setTodayStats] = useState<{ jobs: number; earnings: number | null } | null>(null);
  const [dashboardErrors, setDashboardErrors] = useState<string[]>([]);
  const reportError = useCallback((error: string) => {
    setDashboardErrors(current => current.includes(error) ? current : [...current, error]);
  }, []);

  const fetchWeeklyEarnings = useCallback(async () => {
    if (!provider) return;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const results = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('provider_earnings')
        .select('provider_amount')
        .eq('provider_id', provider.id)
        .gte('created_at', `${dateStr}T00:00:00`)
        .lte('created_at', `${dateStr}T23:59:59`);
      if (error) {
        console.error('Could not load provider earnings:', error);
        reportError('Weekly earnings could not be loaded.');
        setWeeklyData(null);
        return;
      }
      results.push({
        day: days[d.getDay()],
        earnings: data?.reduce((sum, e) => sum + Number(e.provider_amount), 0) ?? 0,
      });
    }
    setWeeklyData(results);
  }, [provider, reportError]);

  const fetchPending = useCallback(async () => {
    if (!provider) return;
    const { data, error } = await (supabase as any)
      .from('bookings')
      .select('*, services(name, icon_name, duration_minutes)')
      // customer_name & customer_phone are now direct columns on bookings
      .eq('provider_id', provider.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);
    if (error) {
      console.error('Could not load pending provider bookings:', error);
      reportError('Pending requests could not be loaded.');
      setPendingBookings(null);
      return;
    }
    setPendingBookings(data ?? []);
  }, [provider, reportError]);

  const fetchTodayStats = useCallback(async () => {
    if (!provider) return;
    const today = new Date().toISOString().split('T')[0];
    const { data: todayBookings, error } = await (supabase as any)
      .from('bookings')
      .select('provider_amount, total_amount, platform_fee')
      .eq('provider_id', provider.id)
      .or(`booking_date.eq.${today},scheduled_date.eq.${today}`)
      .eq('status', 'completed');
    if (error) {
      console.error('Could not load today’s provider statistics:', error);
      reportError('Today’s earnings could not be loaded.');
      setTodayStats(null);
      return;
    }
    const amounts = (todayBookings ?? []).map((booking: any) => {
      if (booking.provider_amount != null) return Number(booking.provider_amount);
      if (booking.total_amount != null && booking.platform_fee != null) {
        return Number(booking.total_amount) - Number(booking.platform_fee);
      }
      return null;
    });
    setTodayStats({
      jobs: todayBookings?.length ?? 0,
      earnings: amounts.every((amount: number | null) => amount !== null)
        ? amounts.reduce((sum: number, amount: number | null) => sum + (amount ?? 0), 0)
        : null,
    });
  }, [provider, reportError]);

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
    { label: "Today's Earnings", value: todayStats?.earnings != null ? `₹${todayStats.earnings.toLocaleString('en-IN')}` : '—', icon: IndianRupee, color: 'text-primary' },
    { label: 'Rating', value: provider?.rating != null ? `${Number(provider.rating).toFixed(1)} ⭐` : '—', icon: Star, color: 'text-primary' },
    { label: 'Total Jobs', value: provider?.total_jobs ?? '—', icon: Briefcase, color: 'text-blue-400' },
    { label: 'Acceptance', value: provider?.acceptance_rate != null ? `${Number(provider.acceptance_rate).toFixed(0)}%` : '—', icon: TrendingUp, color: 'text-success' },
  ];

  if (provider?.kyc_status !== 'approved') {
    return <LockedPage pageName="Dashboard" />;
  }

  return (
    <div className="space-y-6">
      {dashboardErrors.length > 0 && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {dashboardErrors.join(' ')}
        </div>
      )}
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
            {weeklyData ? <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData}>
                <XAxis dataKey="day" stroke="hsl(40 6% 55%)" fontSize={12} />
                <YAxis stroke="hsl(40 6% 55%)" fontSize={12} tickFormatter={v => `₹${v}`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(30 5% 12%)', border: '1px solid hsl(30 5% 20%)', borderRadius: '8px', color: 'hsl(40 10% 90%)' }}
                  formatter={(v: number) => [`₹${v}`, 'Earnings']}
                />
                <Bar dataKey="earnings" fill="hsl(45 100% 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer> : <p className="py-20 text-center text-sm text-muted-foreground">Earnings data unavailable.</p>}
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
            {pendingBookings === null ? (
              <p className="text-muted-foreground text-sm text-center py-8">Pending requests unavailable.</p>
            ) : pendingBookings.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No pending requests 🎉</p>
            ) : (
              <div className="space-y-3">
                {pendingBookings.map((b, i) => (
                  <motion.div key={b.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => navigate('/provider-panel/bookings')}
                  >
                    <div className="flex-1 min-w-0">
                      {((b as any).services?.name) && <p className="font-medium text-sm truncate">{(b as any).services.name}</p>}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Clock className="h-3 w-3" />
                        {b.scheduled_date && <span>{new Date(b.scheduled_date).toLocaleDateString()}</span>}
                        {b.scheduled_time && <span>· {b.scheduled_time}</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {(b.address || b.city) && <span className="truncate">{b.address || b.city}</span>}
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      {b.provider_amount != null || (b.total_amount != null && b.platform_fee != null) ? (
                        <p className="font-semibold text-sm text-primary">₹{Number(
                          b.provider_amount ?? Number(b.total_amount) - Number(b.platform_fee)
                        ).toLocaleString('en-IN')}</p>
                      ) : null}
                      {statusClasses[b.status] && <Badge className={statusClasses[b.status]} variant="secondary">{b.status}</Badge>}
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
