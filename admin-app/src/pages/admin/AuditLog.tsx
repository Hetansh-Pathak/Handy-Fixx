import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, RefreshCw, ChevronLeft, ChevronRight, Shield, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDateTime, timeAgo, shortId } from '@/lib/utils';

const PAGE_SIZE = 25;

interface AuditEntry {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  kyc_approved: 'bg-success/20 text-success border border-success/30',
  kyc_rejected: 'bg-destructive/20 text-destructive border border-destructive/30',
  provider_suspended: 'bg-destructive/20 text-destructive border border-destructive/30',
  provider_reactivated: 'bg-success/20 text-success border border-success/30',
  booking_cancelled: 'bg-destructive/20 text-destructive border border-destructive/30',
  booking_reassigned: 'bg-primary/20 text-primary border border-primary/30',
};

const AuditLog: React.FC = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [searchEntityId, setSearchEntityId] = useState('');

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('admin_audit_log')
        .select('*', { count: 'exact' });

      if (actionFilter !== 'all') query = query.eq('action', actionFilter);
      if (entityFilter !== 'all') query = query.eq('entity_type', entityFilter);
      if (searchEntityId.trim()) query = query.ilike('entity_id', `%${searchEntityId.trim()}%`);

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (error) throw error;
      setLogs((data ?? []) as unknown as AuditEntry[]);
      setTotal(count ?? 0);
    } catch (err: unknown) {
      toast({ title: 'Error loading audit logs', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityFilter, searchEntityId, toast]);

  useEffect(() => { fetchAuditLogs(); }, [fetchAuditLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Read-only immutable trail of administrative actions</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={loading} className="text-xs">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Entity ID…"
            value={searchEntityId}
            onChange={e => { setSearchEntityId(e.target.value); setPage(0); }}
            className="pl-9 glass-input text-xs"
          />
        </div>

        <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44 glass-input text-xs">
            <SelectValue placeholder="Action Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="kyc_approved">KYC Approved</SelectItem>
            <SelectItem value="kyc_rejected">KYC Rejected</SelectItem>
            <SelectItem value="provider_suspended">Provider Suspended</SelectItem>
            <SelectItem value="provider_reactivated">Provider Reactivated</SelectItem>
            <SelectItem value="booking_cancelled">Booking Cancelled</SelectItem>
            <SelectItem value="booking_reassigned">Booking Reassigned</SelectItem>
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={v => { setEntityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40 glass-input text-xs">
            <SelectValue placeholder="Entity Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="service_provider">Provider</SelectItem>
            <SelectItem value="booking">Booking</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Audit Log Table */}
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {['Timestamp', 'Admin User', 'Action', 'Entity Type', 'Entity ID', 'Details'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td colSpan={6} className="px-4 py-3"><Skeleton className="h-8 w-full rounded-lg" /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No audit records found
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                      <span className="block text-[10px] opacity-70">{timeAgo(log.created_at)}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {shortId(log.admin_id)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('text-[10px]', ACTION_COLORS[log.action] ?? 'bg-secondary text-foreground')}>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                      {log.entity_type}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-foreground">
                      {shortId(log.entity_id)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                      {log.details ? (
                        <pre className="text-[10px] bg-secondary/50 p-1.5 rounded border border-border/50 overflow-x-auto max-h-16">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      ) : (
                        '—'
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 text-xs text-muted-foreground">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3 w-3 mr-1" /> Prev
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AuditLog;
