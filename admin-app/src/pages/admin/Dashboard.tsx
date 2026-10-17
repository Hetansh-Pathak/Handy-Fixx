import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield, Users, BookOpen, CheckCircle, XCircle, Clock,
  AlertTriangle, TrendingUp, ArrowRight, RefreshCw, Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDateTime, timeAgo, STATUS_STYLES } from '@/lib/utils';

interface DashboardCounts {
  pending_kyc: number;
  active_providers: number;
  suspended_providers: number;
  bookings_today: number;
  pending_bookings: number;
  in_progress_bookings: number;
  completed_today: number;
  cancelled_today: number;
  needs_attention: NeedsAttentionItem[];
}

interface NeedsAttentionItem {
  type: 'kyc_stale' | 'pending_long' | 'suspended_provider';
  id: string;
  label: string;
  detail: string;
  link_to: string;
}

interface AuditEntry {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const KpiCard = ({
  icon, label, value, color, to,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  to?: string;
}) => (
  <motion.div whileHover={{ scale: 1.02 }} className="glass-card p-5 space-y-3">
    <div className="flex items-center justify-between">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
        {icon}
      </div>
      {to && (
        <Link to={to} className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
          View <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
    <div>
      <p className="text-2xl font-extrabold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  </motion.div>
);

const Dashboard: React.FC = () => {
  const { toast } = useToast();
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [countsRes, auditRes] = await Promise.all([
        supabase.rpc('admin_get_dashboard_counts'),
        supabase
          .from('admin_audit_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (countsRes.error) throw countsRes.error;
      // admin_get_dashboard_counts answers {error: 'Permission denied'} as DATA (not as an RPC error). Treating that
      // as counts rendered a dashboard full of undefined values.
      const raw = countsRes.data as unknown as (Partial<DashboardCounts> & { error?: string }) | null;
      if (!raw || raw.error) throw new Error(raw?.error ?? 'Dashboard data unavailable');
      setCounts({
        pending_kyc: raw.pending_kyc ?? 0,
        active_providers: raw.active_providers ?? 0,
        suspended_providers: raw.suspended_providers ?? 0,
        bookings_today: raw.bookings_today ?? 0,
        pending_bookings: raw.pending_bookings ?? 0,
        in_progress_bookings: raw.in_progress_bookings ?? 0,
        completed_today: raw.completed_today ?? 0,
        cancelled_today: raw.cancelled_today ?? 0,
        needs_attention: Array.isArray(raw.needs_attention) ? raw.needs_attention : [],
      });

      if (auditRes.error) throw auditRes.error;
      setAuditLog((auditRes.data ?? []) as AuditEntry[]);
    } catch (err: unknown) {
      const msg = err instanceof Error 
        ? err.message 
        : (typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : 'Failed to load dashboard');
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const kpis = counts ? [
    { icon: <Shield className="h-5 w-5 text-warning" />, label: 'Pending KYC', value: counts.pending_kyc, color: 'bg-warning/10', to: '/kyc' },
    { icon: <CheckCircle className="h-5 w-5 text-success" />, label: 'Active Providers', value: counts.active_providers, color: 'bg-success/10', to: '/providers' },
    { icon: <XCircle className="h-5 w-5 text-destructive" />, label: 'Suspended', value: counts.suspended_providers, color: 'bg-destructive/10', to: '/providers?status=suspended' },
    { icon: <BookOpen className="h-5 w-5 text-primary" />, label: 'Bookings Today', value: counts.bookings_today, color: 'bg-primary/10', to: '/bookings' },
    { icon: <Clock className="h-5 w-5 text-warning" />, label: 'Pending Bookings', value: counts.pending_bookings, color: 'bg-warning/10', to: '/bookings?status=pending' },
    { icon: <TrendingUp className="h-5 w-5 text-blue-500" />, label: 'In Progress', value: counts.in_progress_bookings, color: 'bg-blue-500/10', to: '/bookings?status=in_progress' },
    { icon: <CheckCircle className="h-5 w-5 text-success" />, label: 'Completed Today', value: counts.completed_today, color: 'bg-success/10' },
    { icon: <XCircle className="h-5 w-5 text-destructive" />, label: 'Cancelled Today', value: counts.cancelled_today, color: 'bg-destructive/10' },
  ] : [];

  const ACTION_LABELS: Record<string, string> = {
    kyc_approved: '✅ KYC Approved',
    kyc_rejected: '❌ KYC Rejected',
    provider_suspended: '🚫 Provider Suspended',
    provider_reactivated: '✅ Provider Reactivated',
    booking_cancelled: '❌ Booking Cancelled',
    booking_reassigned: '🔄 Booking Reassigned',
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Platform overview and operational summary</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="text-xs">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* KPI Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <KpiCard {...kpi} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Needs Attention + Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Attention */}
        <Card className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h2 className="font-bold text-foreground">Needs Attention</h2>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : counts?.needs_attention && counts.needs_attention.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
              {counts.needs_attention.map((item) => (
                <Link
                  key={item.id}
                  to={item.link_to}
                  className="block p-3 rounded-xl bg-warning/5 border border-warning/20 hover:border-warning/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">All clear — no items need attention</p>
            </div>
          )}
        </Card>

        {/* Recent Audit Log */}
        <Card className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-foreground">Recent Admin Actions</h2>
            </div>
            <Link to="/audit" className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
            </div>
          ) : auditLog.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No admin actions yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
              {auditLog.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-2 p-2.5 rounded-xl hover:bg-secondary/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Entity: {entry.entity_id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                    {timeAgo(entry.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
