import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, ChevronLeft, ChevronRight, MoreVertical,
  UserX, UserCheck, Eye, Loader2, Star, Briefcase,
  MapPin, AlertTriangle, CheckCircle, XCircle, Phone
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDate, formatDateTime, timeAgo, maskAadhaar, maskPAN, STATUS_STYLES, STATUS_LABELS, SUSPEND_REASONS, safeSearch } from '@/lib/utils';

const PAGE_SIZE = 20;

interface Provider {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  status: string;
  kyc_status: string;
  kyc_rejection_reason: string | null;
  is_online: boolean | null;
  is_verified: boolean;
  rating: number | null;
  total_jobs: number | null;
  total_reviews: number | null;
  total_earnings: number | null;
  pincodes: string[] | null;
  service_ids: string[] | null;
  experience_years: number | null;
  created_at: string;
  updated_at: string;
}

const ProviderAvatar = ({ provider, size = 'sm' }: { provider: Provider; size?: 'sm' | 'lg' }) => {
  const cls = size === 'lg' ? 'w-14 h-14 text-lg' : 'w-8 h-8 text-xs';
  return provider.avatar_url ? (
    <img src={provider.avatar_url} alt={provider.full_name} className={cn(cls, 'rounded-full object-cover shrink-0')} />
  ) : (
    <div className={cn(cls, 'rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0')}>
      {provider.full_name[0]?.toUpperCase()}
    </div>
  );
};

const Providers: React.FC = () => {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('status');
    return q && ['active', 'suspended', 'pending_approval', 'inactive'].includes(q) ? q : 'all';
  });
  const [kycFilter, setKycFilter] = useState('all');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Drawer
  const [drawerProvider, setDrawerProvider] = useState<Provider | null>(null);
  const [kycDocs, setKycDocs] = useState<Record<string, string>>({});
  const [kycData, setKycData] = useState<Record<string, string | null>>({});
  const [providerBookings, setProviderBookings] = useState<unknown[]>([]);
  const [providerAudit, setProviderAudit] = useState<unknown[]>([]);
  const [drawerTab, setDrawerTab] = useState('overview');

  // Suspend dialog
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<Provider | null>(null);
  const [suspendPreset, setSuspendPreset] = useState(SUSPEND_REASONS[0]);
  const [suspendCustom, setSuspendCustom] = useState('');
  const [openBookingCount, setOpenBookingCount] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  // Reactivate dialog
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [reactivateTarget, setReactivateTarget] = useState<Provider | null>(null);
  const [reactivateNote, setReactivateNote] = useState('');

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('service_providers')
        .select('*', { count: 'exact' });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (kycFilter !== 'all') query = query.eq('kyc_status', kycFilter);
      const term = safeSearch(search);
      if (term) {
        query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (error) throw error;
      setProviders((data ?? []) as Provider[]);
      setTotal(count ?? 0);
    } catch (err: unknown) {
      toast({ title: 'Error loading providers', description: err instanceof Error ? err.message : 'Unknown', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, kycFilter, search, toast]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const handleSearchChange = (val: string) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(0); }, 400);
  };

  const openDrawer = async (p: Provider) => {
    setDrawerProvider(p);
    setDrawerTab('overview');
    setKycDocs({});
    setKycData({});
    setProviderBookings([]);
    setProviderAudit([]);

    // Load KYC docs
    const { data: kyc } = await supabase
      .from('provider_kyc')
      .select('*')
      .eq('provider_id', p.id)
      .maybeSingle();

    if (kyc) {
      setKycData({
        aadhaar_last4: kyc.aadhaar_last4,
        pan_number: kyc.pan_number,
      });
      const paths: Record<string, string | null> = {
        selfie: kyc.selfie_path,
        aadhaar_front: kyc.aadhaar_front_path,
        aadhaar_back: kyc.aadhaar_back_path,
        pan: kyc.pan_path,
        certificate: kyc.certificate_path,
      };
      const urls: Record<string, string> = {};
      for (const [key, path] of Object.entries(paths)) {
        if (path) {
          const { data: signed } = await supabase.storage.from('provider-kyc').createSignedUrl(path, 1800);
          if (signed?.signedUrl) urls[key] = signed.signedUrl;
        }
      }
      setKycDocs(urls);
    }

    // Load recent bookings
    const { data: bkgs } = await supabase
      .from('bookings')
      .select('id, status, scheduled_date, total_amount, created_at')
      .eq('provider_id', p.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setProviderBookings(bkgs ?? []);

    // Load audit log
    const { data: audit } = await supabase
      .from('admin_audit_log')
      .select('*')
      .eq('entity_id', p.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setProviderAudit(audit ?? []);
  };

  const openSuspendDialog = async (p: Provider) => {
    setSuspendTarget(p);
    setSuspendPreset(SUSPEND_REASONS[0]);
    setSuspendCustom('');
    // Count open bookings
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', p.id)
      .in('status', ['pending', 'confirmed', 'on_the_way', 'in_progress']);
    setOpenBookingCount(count ?? 0);
    setSuspendDialogOpen(true);
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    const reason = suspendPreset === 'Other' ? suspendCustom.trim() : suspendPreset;
    if (!reason || reason.length < 5) {
      toast({ title: 'Reason too short', description: 'Suspension reason must be at least 5 characters.', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_suspend_provider', {
        p_provider_id: suspendTarget.id,
        p_reason: reason,
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (res?.success === false) throw new Error(res.error ?? 'Suspension failed');
      toast({ title: '🚫 Provider Suspended', description: `${suspendTarget.full_name} has been suspended.` });
      setSuspendDialogOpen(false);
      setDrawerProvider(null);
      fetchProviders();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    if (!reactivateTarget) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_reactivate_provider', {
        p_provider_id: reactivateTarget.id,
        p_note: reactivateNote.trim() || undefined,
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (res?.success === false) throw new Error(res.error ?? 'Reactivation failed');
      toast({ title: '✅ Provider Reactivated', description: `${reactivateTarget.full_name} is now active.` });
      setReactivateDialogOpen(false);
      setDrawerProvider(null);
      fetchProviders();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Providers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} provider{total !== 1 ? 's' : ''} registered</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone…"
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 glass-input text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36 glass-input text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kycFilter} onValueChange={v => { setKycFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36 glass-input text-sm">
            <SelectValue placeholder="KYC Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All KYC</SelectItem>
            <SelectItem value="pending">Pending KYC</SelectItem>
            <SelectItem value="approved">KYC Approved</SelectItem>
            <SelectItem value="rejected">KYC Rejected</SelectItem>
            <SelectItem value="not_submitted">Not Submitted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {['Provider', 'Contact', 'Cities', 'Rating', 'Jobs', 'KYC', 'Status', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td colSpan={9} className="px-4 py-3">
                      <Skeleton className="h-8 w-full rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : providers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No providers found
                  </td>
                </tr>
              ) : (
                providers.map(p => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn(
                      'border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors',
                      p.status === 'suspended' && 'bg-destructive/5'
                    )}
                    onClick={() => openDrawer(p)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <ProviderAvatar provider={p} />
                          {p.is_online && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-background" />
                          )}
                        </div>
                        <span className="font-medium text-foreground truncate max-w-[120px]">{p.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">{p.email}</p>
                      <p className="text-xs text-muted-foreground">{p.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[100px]">
                        {(p.pincodes ?? []).slice(0, 2).map(pin => (
                          <span key={pin} className="text-[10px] bg-secondary rounded-full px-1.5 py-0.5">{pin}</span>
                        ))}
                        {(p.pincodes?.length ?? 0) > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{(p.pincodes?.length ?? 0) - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs">
                        <Star className="h-3 w-3 text-warning fill-warning" />
                        <span>{p.rating?.toFixed(1) ?? '—'}</span>
                        <span className="text-muted-foreground">({p.total_reviews ?? 0})</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground">{p.total_jobs ?? 0}</td>
                    <td className="px-4 py-3">
                      <Badge className={cn('text-[10px]', STATUS_STYLES[p.kyc_status] ?? '')}>
                        {STATUS_LABELS[p.kyc_status] ?? p.kyc_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('text-[10px]', STATUS_STYLES[p.status] ?? '')}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {p.status !== 'suspended' ? (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-[10px] border-destructive/30 text-destructive hover:bg-destructive/10"
                            onClick={() => openSuspendDialog(p)}
                          >
                            <UserX className="h-3 w-3 mr-1" /> Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="outline"
                            className={cn("h-7 text-[10px] border-success/30 text-success hover:bg-success/10", p.kyc_status !== 'approved' && 'opacity-50 cursor-not-allowed')}
                            disabled={p.kyc_status !== 'approved'}
                            onClick={() => { setReactivateTarget(p); setReactivateNote(''); setReactivateDialogOpen(true); }}
                            title={p.kyc_status !== 'approved' ? 'KYC must be approved before reactivation' : ''}
                          >
                            <UserCheck className="h-3 w-3 mr-1" /> Reactivate
                          </Button>
                        )}
                      </div>
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

      {/* Provider Drawer */}
      <Sheet open={!!drawerProvider} onOpenChange={() => setDrawerProvider(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" side="right">
          {drawerProvider && (
            <>
              <SheetHeader className="pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <ProviderAvatar provider={drawerProvider} size="lg" />
                  <div>
                    <SheetTitle className="text-lg">{drawerProvider.full_name}</SheetTitle>
                    <div className="flex gap-2 mt-1">
                      <Badge className={cn('text-[10px]', STATUS_STYLES[drawerProvider.kyc_status] ?? '')}>
                        {STATUS_LABELS[drawerProvider.kyc_status] ?? drawerProvider.kyc_status}
                      </Badge>
                      <Badge className={cn('text-[10px]', STATUS_STYLES[drawerProvider.status] ?? '')}>
                        {STATUS_LABELS[drawerProvider.status] ?? drawerProvider.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Suspension banner */}
                {drawerProvider.status === 'suspended' && (
                  <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                    <p className="font-bold mb-1">⚠️ Account Suspended</p>
                    {/* Fetching suspension reason from audit would be ideal; fallback note shown */}
                    <p className="text-destructive/80">This provider is suspended and cannot accept bookings or go online.</p>
                  </div>
                )}
              </SheetHeader>

              {/* Action buttons */}
              <div className="flex gap-2 py-3 border-b border-border">
                {drawerProvider.status !== 'suspended' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"
                    onClick={() => openSuspendDialog(drawerProvider)}
                  >
                    <UserX className="h-3.5 w-3.5 mr-1.5" /> Suspend Provider
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("border-success/30 text-success hover:bg-success/10 text-xs", drawerProvider.kyc_status !== 'approved' && 'opacity-40 cursor-not-allowed')}
                    disabled={drawerProvider.kyc_status !== 'approved'}
                    onClick={() => { setReactivateTarget(drawerProvider); setReactivateNote(''); setReactivateDialogOpen(true); }}
                    title={drawerProvider.kyc_status !== 'approved' ? 'Provider must have approved KYC to reactivate' : ''}
                  >
                    <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Reactivate
                  </Button>
                )}
              </div>

              {/* Drawer tabs */}
              <Tabs value={drawerTab} onValueChange={setDrawerTab} className="mt-4">
                <TabsList className="w-full grid grid-cols-4 bg-secondary/50 text-xs">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="kyc">KYC</TabsTrigger>
                  <TabsTrigger value="bookings">Bookings</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                {/* Overview */}
                <TabsContent value="overview" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label: 'Email', value: drawerProvider.email },
                      { label: 'Phone', value: drawerProvider.phone },
                      { label: 'Experience', value: `${drawerProvider.experience_years ?? 0} years` },
                      { label: 'Total Jobs', value: drawerProvider.total_jobs ?? 0 },
                      { label: 'Rating', value: drawerProvider.rating ? `${drawerProvider.rating.toFixed(1)} ★` : '—' },
                      { label: 'Reviews', value: drawerProvider.total_reviews ?? 0 },
                      { label: 'Total Earnings', value: drawerProvider.total_earnings ? `₹${drawerProvider.total_earnings}` : '—' },
                      { label: 'Joined', value: formatDate(drawerProvider.created_at) },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-3 rounded-xl bg-secondary/40">
                        <p className="text-muted-foreground">{label}</p>
                        <p className="font-semibold text-foreground mt-0.5">{value ?? '—'}</p>
                      </div>
                    ))}
                  </div>
                  {drawerProvider.bio && (
                    <div className="p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground mb-1">Bio</p>
                      {drawerProvider.bio}
                    </div>
                  )}
                  {(drawerProvider.pincodes?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Service Cities / Pincodes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {drawerProvider.pincodes?.map(pin => (
                          <span key={pin} className="text-[10px] bg-secondary rounded-full px-2 py-0.5">{pin}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* KYC */}
                <TabsContent value="kyc" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-3 text-xs bg-secondary/30 p-3 rounded-xl">
                    <div>
                      <p className="text-muted-foreground">Aadhaar Last 4</p>
                      <p className="font-mono font-bold">{kycData.aadhaar_last4 ? maskAadhaar(kycData.aadhaar_last4) : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">PAN Number</p>
                      <p className="font-mono font-bold">{kycData.pan_number ? maskPAN(kycData.pan_number) : 'N/A'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Selfie', key: 'selfie' },
                      { label: 'Aadhaar Front', key: 'aadhaar_front' },
                      { label: 'Aadhaar Back', key: 'aadhaar_back' },
                      { label: 'PAN Card', key: 'pan' },
                    ].map(({ label, key }) => (
                      <div key={key} className="space-y-1 text-[10px]">
                        <p className="font-semibold text-muted-foreground">{label}</p>
                        {kycDocs[key] ? (
                          <a href={kycDocs[key]} target="_blank" rel="noopener noreferrer">
                            <img src={kycDocs[key]} alt={label} className="h-24 w-full object-cover rounded-lg border border-border hover:opacity-80 transition-opacity" />
                          </a>
                        ) : (
                          <div className="h-24 rounded-lg bg-secondary/50 flex items-center justify-center text-muted-foreground">
                            Not provided
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Bookings */}
                <TabsContent value="bookings" className="pt-4">
                  {providerBookings.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No bookings found</p>
                  ) : (
                    <div className="space-y-2">
                      {(providerBookings as { id: string; status: string; scheduled_date: string | null; total_amount: number; created_at: string }[]).map(b => (
                        <div key={b.id} className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/30 text-xs">
                          <span className="font-mono text-muted-foreground">#{b.id.slice(0, 8).toUpperCase()}</span>
                          <Badge className={cn('text-[10px]', STATUS_STYLES[b.status] ?? '')}>{b.status}</Badge>
                          <span className="text-muted-foreground">{formatDate(b.scheduled_date ?? b.created_at)}</span>
                          <span className="font-semibold">₹{b.total_amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Activity */}
                <TabsContent value="activity" className="pt-4">
                  {providerAudit.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No admin actions for this provider</p>
                  ) : (
                    <div className="space-y-2">
                      {(providerAudit as { id: string; action: string; details: Record<string, unknown> | null; created_at: string }[]).map(a => (
                        <div key={a.id} className="p-2.5 rounded-xl bg-secondary/30 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">{a.action}</span>
                            <span className="text-muted-foreground">{timeAgo(a.created_at)}</span>
                          </div>
                          {Boolean(a.details?.reason) && (
                            <p className="text-muted-foreground">Reason: {String(a.details?.reason)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Suspend Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Suspend Provider</DialogTitle>
            <DialogDescription>
              Suspending <strong>{suspendTarget?.full_name}</strong> will force them offline and prevent new bookings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {openBookingCount > 0 && (
              <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-xs text-warning">
                <p className="font-bold">⚠️ {openBookingCount} open booking{openBookingCount > 1 ? 's' : ''} will NOT be auto-cancelled.</p>
                <p className="mt-1 text-warning/80">You should manually cancel or reassign them from the Bookings page.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Suspension Reason</Label>
              {SUSPEND_REASONS.map(r => (
                <label key={r} className={cn('flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs', suspendPreset === r ? 'border-destructive bg-destructive/10 font-bold' : 'border-border hover:bg-secondary/50')}>
                  <input type="radio" name="suspend_reason" checked={suspendPreset === r} onChange={() => setSuspendPreset(r)} className="shrink-0" />
                  {r}
                </label>
              ))}
              {suspendPreset === 'Other' && (
                <Textarea
                  placeholder="Enter reason (min 5 characters)…"
                  value={suspendCustom}
                  onChange={e => setSuspendCustom(e.target.value)}
                  className="glass-input h-20 text-xs mt-2"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)} className="text-xs">Cancel</Button>
            <Button variant="destructive" onClick={handleSuspend} disabled={actionLoading} className="text-xs font-bold">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Suspension'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate Dialog */}
      <Dialog open={reactivateDialogOpen} onOpenChange={setReactivateDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Reactivate Provider</DialogTitle>
            <DialogDescription>
              <strong>{reactivateTarget?.full_name}</strong> will be set to active and can accept bookings again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">Optional Note</Label>
            <Textarea
              placeholder="Add an internal note (optional)…"
              value={reactivateNote}
              onChange={e => setReactivateNote(e.target.value)}
              className="glass-input h-20 text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReactivateDialogOpen(false)} className="text-xs">Cancel</Button>
            <Button className="bg-success hover:bg-success/90 text-success-foreground text-xs font-bold" onClick={handleReactivate} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '✅ Reactivate Provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Providers;
