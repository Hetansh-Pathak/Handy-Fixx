import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, ChevronLeft, ChevronRight, Eye, Loader2,
  Calendar, Clock, MapPin, User, Shield, AlertTriangle,
  RefreshCw, CheckCircle, XCircle, UserCheck, ArrowRight,
  Phone, Mail, FileText, Image as ImageIcon, Volume2
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDate, formatDateTime, timeAgo, shortId, STATUS_STYLES, STATUS_LABELS, CANCEL_REASONS } from '@/lib/utils';

const PAGE_SIZE = 20;

interface Booking {
  id: string;
  customer_id: string | null;
  provider_id: string | null;
  service_id: string | null;
  status: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  address: string;
  city: string | null;
  pincode: string | null;
  description: string | null;
  total_amount: number;
  platform_fee: number;
  provider_amount: number;
  customer_name: string | null;
  customer_phone: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields
  profiles?: { full_name: string | null; phone: string | null; email: string | null } | null;
  service_providers?: { full_name: string; phone: string | null; rating: number | null; kyc_status: string; status: string } | null;
  services?: { name: string; category: string | null } | null;
}

interface Attachment {
  id: string;
  type: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  created_at: string;
  signedUrl?: string;
}

interface EligibleProvider {
  id: string;
  full_name: string;
  phone: string | null;
  rating: number | null;
  total_jobs: number | null;
}

const Bookings: React.FC = () => {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [realtimeAlert, setRealtimeAlert] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Drawer
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [hasCode, setHasCode] = useState<boolean | null>(null);
  const [bookingAudit, setBookingAudit] = useState<unknown[]>([]);
  const [loadingDrawer, setLoadingDrawer] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  // Cancel Dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelPreset, setCancelPreset] = useState(CANCEL_REASONS[0]);
  const [cancelCustom, setCancelCustom] = useState('');
  const [notifyUsers, setNotifyUsers] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Reassign Dialog
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [eligibleProviders, setEligibleProviders] = useState<EligibleProvider[]>([]);
  const [selectedNewProvider, setSelectedNewProvider] = useState<string>('');
  const [reassignReason, setReassignReason] = useState('');
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('bookings')
        .select(`
          *,
          profiles:customer_id (full_name, phone, email),
          service_providers:provider_id (full_name, phone, rating, kyc_status, status),
          services:service_id (name, category)
        `, { count: 'exact' });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (cityFilter !== 'all') query = query.eq('city', cityFilter);
      if (search.trim()) {
        query = query.or(`id.ilike.%${search}%,address.ilike.%${search}%,customer_name.ilike.%${search}%`);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (error) throw error;
      setBookings((data ?? []) as unknown as Booking[]);
      setTotal(count ?? 0);
      setRealtimeAlert(false);
    } catch (err: unknown) {
      toast({ title: 'Error loading bookings', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, cityFilter, search, toast]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // Realtime listener for bookings table updates
  useEffect(() => {
    const channel = supabase
      .channel('admin-bookings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        setRealtimeAlert(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSearchChange = (val: string) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(0); }, 400);
  };

  const openDrawer = async (b: Booking) => {
    setSelectedBooking(b);
    setLoadingDrawer(true);
    setAttachments([]);
    setHasCode(null);
    setBookingAudit([]);

    try {
      // 1. Fetch attachments
      const { data: atts } = await supabase
        .from('booking_attachments')
        .select('*')
        .eq('booking_id', b.id);

      if (atts && atts.length > 0) {
        const list: Attachment[] = [];
        for (const item of atts) {
          const { data: signed } = await supabase.storage.from('booking-attachments').createSignedUrl(item.storage_path, 1800);
          list.push({ ...item, signedUrl: signed?.signedUrl });
        }
        setAttachments(list);
      }

      // 2. Check if completion code exists (never expose code value!)
      const { data: codeData } = await supabase
        .from('booking_completion_codes')
        .select('booking_id')
        .eq('booking_id', b.id)
        .maybeSingle();

      setHasCode(!!codeData);

      // 3. Fetch audit log for this booking
      const { data: audit } = await supabase
        .from('admin_audit_log')
        .select('*')
        .eq('entity_id', b.id)
        .order('created_at', { ascending: false });

      setBookingAudit(audit ?? []);
    } catch (err) {
      console.error('Error fetching drawer info:', err);
    } finally {
      setLoadingDrawer(false);
    }
  };

  // Open Reassign Dialog and fetch eligible providers
  const openReassignModal = async (b: Booking) => {
    setSelectedBooking(b);
    setSelectedNewProvider('');
    setReassignReason('');
    setProviderSearch('');
    setReassignDialogOpen(true);
    setLoadingEligible(true);

    try {
      // Query approved & active providers
      const { data: sps } = await supabase
        .from('service_providers')
        .select('id, full_name, phone, rating, total_jobs')
        .eq('kyc_status', 'approved')
        .eq('status', 'active');

      // Exclude current provider
      const filtered = (sps ?? []).filter(p => p.id !== b.provider_id);
      setEligibleProviders(filtered as EligibleProvider[]);
    } catch (err) {
      toast({ title: 'Error loading providers', description: 'Could not fetch eligible providers', variant: 'destructive' });
    } finally {
      setLoadingEligible(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking) return;
    const reason = cancelPreset === 'Other' ? cancelCustom.trim() : cancelPreset;
    if (!reason || reason.length < 5) {
      toast({ title: 'Reason required', description: 'Cancellation reason must be at least 5 characters', variant: 'destructive' });
      return;
    }

    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_cancel_booking', {
        p_booking_id: selectedBooking.id,
        p_reason: reason,
        p_notify: notifyUsers,
      });

      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (res?.success === false) throw new Error(res.error ?? 'Cancellation failed');

      toast({ title: '❌ Booking Cancelled', description: `Booking ${shortId(selectedBooking.id)} has been cancelled.` });
      setCancelDialogOpen(false);
      setSelectedBooking(null);
      fetchBookings();
    } catch (err: unknown) {
      toast({ title: 'Cancellation Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReassignBooking = async () => {
    if (!selectedBooking || !selectedNewProvider) return;
    if (!reassignReason.trim() || reassignReason.trim().length < 5) {
      toast({ title: 'Reason required', description: 'Please provide a valid reassign reason (min 5 chars)', variant: 'destructive' });
      return;
    }

    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_reassign_booking', {
        p_booking_id: selectedBooking.id,
        p_new_provider_id: selectedNewProvider,
        p_reason: reassignReason.trim(),
      });

      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (res?.success === false) throw new Error(res.error ?? 'Reassignment failed');

      toast({ title: '🔄 Booking Reassigned', description: `Booking reassigned successfully.` });
      setReassignDialogOpen(false);
      setSelectedBooking(null);
      fetchBookings();
    } catch (err: unknown) {
      toast({ title: 'Reassign Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredProviders = eligibleProviders.filter(p =>
    p.full_name.toLowerCase().includes(providerSearch.toLowerCase()) ||
    p.phone?.includes(providerSearch)
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bookings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} total booking{total !== 1 ? 's' : ''}</p>
        </div>

        {realtimeAlert && (
          <Button
            size="sm"
            onClick={fetchBookings}
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs animate-bounce shadow-gold"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            New Updates Available — Refresh
          </Button>
        )}
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Tabs value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <TabsList className="bg-secondary/50 flex-wrap h-auto p-1">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
            <TabsTrigger value="confirmed" className="text-xs">Confirmed</TabsTrigger>
            <TabsTrigger value="on_the_way" className="text-xs">On the way</TabsTrigger>
            <TabsTrigger value="in_progress" className="text-xs">In progress</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs">Completed</TabsTrigger>
            <TabsTrigger value="cancelled" className="text-xs">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search booking ID, customer, address…"
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 glass-input text-xs"
          />
        </div>
      </div>

      {/* Bookings Table */}
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {['ID', 'Customer', 'Service / Provider', 'Schedule', 'Location', 'Amount', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td colSpan={8} className="px-4 py-3"><Skeleton className="h-8 w-full rounded-lg" /></td>
                  </tr>
                ))
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No bookings found matching filters
                  </td>
                </tr>
              ) : (
                bookings.map(b => (
                  <motion.tr
                    key={b.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={() => openDrawer(b)}
                    className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-bold text-xs text-foreground">
                      {shortId(b.id)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-xs text-foreground truncate max-w-[120px]">
                        {b.customer_name || b.profiles?.full_name || 'Customer'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{b.customer_phone || b.profiles?.phone || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-foreground">{b.services?.name || 'Home Service'}</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[130px]">
                        {b.service_providers?.full_name ? `Pro: ${b.service_providers.full_name}` : 'Unassigned'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium text-foreground">{formatDate(b.scheduled_date || b.created_at)}</p>
                      <p className="text-[10px] text-muted-foreground">{b.scheduled_time || 'Flexible'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <p className="truncate max-w-[120px]">{b.address}</p>
                      <p className="text-[10px] font-semibold">{b.city || ''}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-xs text-foreground">
                      ₹{b.total_amount}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('text-[10px]', STATUS_STYLES[b.status] ?? '')}>
                        {STATUS_LABELS[b.status] ?? b.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openDrawer(b)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
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

      {/* Booking Detail Sheet */}
      <Sheet open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="right">
          {selectedBooking && (
            <div className="space-y-6">
              {/* Header & Status */}
              <SheetHeader className="pb-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono text-muted-foreground">Booking ID</span>
                    <SheetTitle className="text-xl font-mono">{shortId(selectedBooking.id)}</SheetTitle>
                  </div>
                  <Badge className={cn('text-xs px-3 py-1', STATUS_STYLES[selectedBooking.status] ?? '')}>
                    {STATUS_LABELS[selectedBooking.status] ?? selectedBooking.status}
                  </Badge>
                </div>
              </SheetHeader>

              {/* Action Buttons Header */}
              {['pending', 'confirmed', 'on_the_way', 'in_progress'].includes(selectedBooking.status) && (
                <div className="flex gap-2 p-3 rounded-xl bg-secondary/30 border border-border">
                  {['pending', 'confirmed'].includes(selectedBooking.status) && (
                    <Button
                      size="sm" variant="outline"
                      className="flex-1 text-xs border-primary/30 text-primary hover:bg-primary/10 font-medium"
                      onClick={() => openReassignModal(selectedBooking)}
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Reassign Provider
                    </Button>
                  )}
                  <Button
                    size="sm" variant="outline"
                    className="flex-1 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 font-medium"
                    onClick={() => {
                      setCancelPreset(CANCEL_REASONS[0]);
                      setCancelCustom('');
                      setNotifyUsers(true);
                      setCancelDialogOpen(true);
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel Booking
                  </Button>
                </div>
              )}

              {loadingDrawer ? (
                <div className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="space-y-6 text-xs">
                  {/* Customer & Provider Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Customer */}
                    <div className="p-3.5 rounded-xl bg-secondary/40 border border-border space-y-2">
                      <p className="font-bold text-foreground text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-primary" /> Customer Info
                      </p>
                      <p className="font-semibold text-sm">{selectedBooking.customer_name || selectedBooking.profiles?.full_name || 'Customer'}</p>
                      <p className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {selectedBooking.customer_phone || selectedBooking.profiles?.phone || '—'}</p>
                      {selectedBooking.profiles?.email && (
                        <p className="text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> {selectedBooking.profiles.email}</p>
                      )}
                    </div>

                    {/* Provider */}
                    <div className="p-3.5 rounded-xl bg-secondary/40 border border-border space-y-2">
                      <p className="font-bold text-foreground text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-primary" /> Service Provider
                      </p>
                      {selectedBooking.service_providers ? (
                        <>
                          <p className="font-semibold text-sm">{selectedBooking.service_providers.full_name}</p>
                          <p className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {selectedBooking.service_providers.phone || '—'}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge className="text-[10px] bg-primary/10 text-primary">★ {selectedBooking.service_providers.rating?.toFixed(1) ?? 'N/A'}</Badge>
                            <Badge className={cn('text-[10px]', STATUS_STYLES[selectedBooking.service_providers.kyc_status])}>
                              KYC {selectedBooking.service_providers.kyc_status}
                            </Badge>
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground py-2 italic">No provider assigned yet</p>
                      )}
                    </div>
                  </div>

                  {/* Schedule & Address */}
                  <div className="p-3.5 rounded-xl bg-secondary/40 border border-border space-y-2">
                    <p className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> Location & Schedule
                    </p>
                    <p className="font-medium text-foreground">{selectedBooking.address}, {selectedBooking.city} ({selectedBooking.pincode})</p>
                    <div className="flex gap-4 text-muted-foreground pt-1">
                      <span>Date: <strong>{formatDate(selectedBooking.scheduled_date || selectedBooking.created_at)}</strong></span>
                      <span>Time: <strong>{selectedBooking.scheduled_time || 'Flexible'}</strong></span>
                    </div>
                  </div>

                  {/* Problem Description & Attachments */}
                  <div className="p-3.5 rounded-xl bg-secondary/40 border border-border space-y-3">
                    <p className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" /> Customer Problem Description
                    </p>
                    <p className="text-foreground bg-background/50 p-2.5 rounded-lg border border-border/50">
                      {selectedBooking.description || 'No additional note provided by customer.'}
                    </p>

                    {/* Attachments */}
                    {attachments.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <p className="font-semibold text-muted-foreground">Uploaded Photos & Audio</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {attachments.map(att => (
                            <div key={att.id} className="p-2 bg-background/60 rounded-lg border border-border text-center space-y-1">
                              {att.type === 'voice' ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-center gap-1 text-primary">
                                    <Volume2 className="h-4 w-4" />
                                    <span className="font-bold text-[10px]">Voice Note</span>
                                  </div>
                                  {att.signedUrl && (
                                    <audio controls src={att.signedUrl} className="w-full h-8 max-w-full" />
                                  )}
                                </div>
                              ) : (
                                <div>
                                  {att.signedUrl ? (
                                    <img
                                      src={att.signedUrl}
                                      alt="Problem attachment"
                                      onClick={() => setZoomImage(att.signedUrl!)}
                                      className="h-20 w-full object-cover rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                                    />
                                  ) : (
                                    <div className="h-20 bg-secondary flex items-center justify-center text-muted-foreground">No Preview</div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Completion Code Security Check */}
                  <div className="p-3.5 rounded-xl bg-secondary/40 border border-border flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">Completion Code Status</p>
                      <p className="text-muted-foreground text-[10px]">Security verification code generated for job completion</p>
                    </div>
                    {hasCode ? (
                      <Badge className="bg-success/20 text-success border border-success/30 text-[10px]">
                        ✓ Active Code Generated
                      </Badge>
                    ) : (
                      <Badge className="bg-secondary text-muted-foreground text-[10px]">
                        Not Generated / Completed
                      </Badge>
                    )}
                  </div>

                  {/* Pricing Breakdown */}
                  <div className="p-3.5 rounded-xl bg-secondary/40 border border-border space-y-2">
                    <p className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Payment Summary</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-muted-foreground"><span>Total Customer Amount:</span> <span className="font-bold text-foreground">₹{selectedBooking.total_amount}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>Platform Fee:</span> <span>₹{selectedBooking.platform_fee}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>Provider Earnings:</span> <span className="font-bold text-success">₹{selectedBooking.provider_amount}</span></div>
                    </div>
                  </div>

                  {/* Audit Trail */}
                  {bookingAudit.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-secondary/40 border border-border space-y-2">
                      <p className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Admin History</p>
                      <div className="space-y-2">
                        {(bookingAudit as { id: string; action: string; details: Record<string, unknown> | null; created_at: string }[]).map(a => (
                          <div key={a.id} className="p-2 rounded-lg bg-background/50 border border-border/50 text-[11px]">
                            <div className="flex justify-between font-semibold">
                              <span>{a.action}</span>
                              <span className="text-muted-foreground">{timeAgo(a.created_at)}</span>
                            </div>
                            {Boolean(a.details?.reason) && (
                              <p className="text-muted-foreground mt-0.5">Reason: {String(a.details?.reason)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Lightbox for Attachment Photos */}
      <Dialog open={!!zoomImage} onOpenChange={() => setZoomImage(null)}>
        <DialogContent className="bg-black/95 border-border max-w-4xl max-h-[90vh]">
          <DialogHeader><DialogTitle className="text-white text-sm">Attachment Photo</DialogTitle></DialogHeader>
          {zoomImage && (
            <div className="flex items-center justify-center p-2">
              <img src={zoomImage} alt="Attachment" className="max-h-[75vh] w-auto object-contain rounded-lg" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Cancel Booking</DialogTitle>
            <DialogDescription>
              Cancel booking <strong>{selectedBooking ? shortId(selectedBooking.id) : ''}</strong> as administrator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-2">
              <Label className="font-semibold">Reason for Cancellation</Label>
              {CANCEL_REASONS.map(r => (
                <label key={r} className={cn('flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer', cancelPreset === r ? 'border-destructive bg-destructive/10 font-bold' : 'border-border hover:bg-secondary/50')}>
                  <input type="radio" name="cancel_reason" checked={cancelPreset === r} onChange={() => setCancelPreset(r)} className="shrink-0" />
                  {r}
                </label>
              ))}
              {cancelPreset === 'Other' && (
                <Textarea
                  placeholder="Enter custom cancellation reason…"
                  value={cancelCustom}
                  onChange={e => setCancelCustom(e.target.value)}
                  className="glass-input h-20 text-xs mt-2"
                />
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="notify" checked={notifyUsers} onCheckedChange={v => setNotifyUsers(v === true)} />
              <Label htmlFor="notify" className="cursor-pointer text-xs">Send in-app notifications to customer and provider</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} className="text-xs">Close</Button>
            <Button variant="destructive" onClick={handleCancelBooking} disabled={actionLoading} className="text-xs font-bold">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Booking</DialogTitle>
            <DialogDescription>
              Reassign booking <strong>{selectedBooking ? shortId(selectedBooking.id) : ''}</strong> to another active provider.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-2">
              <Label className="font-semibold">Select New Provider (Approved & Active)</Label>
              <Input
                placeholder="Filter providers by name or phone…"
                value={providerSearch}
                onChange={e => setProviderSearch(e.target.value)}
                className="glass-input text-xs"
              />
              {loadingEligible ? (
                <div className="p-4 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 border border-border rounded-lg p-2 bg-secondary/20">
                  {filteredProviders.length === 0 ? (
                    <p className="text-muted-foreground text-center py-3">No eligible providers found</p>
                  ) : (
                    filteredProviders.map(p => (
                      <label
                        key={p.id}
                        className={cn(
                          'flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors',
                          selectedNewProvider === p.id ? 'border-primary bg-primary/10 font-bold' : 'border-border/50 hover:bg-secondary/60'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input type="radio" name="new_provider" checked={selectedNewProvider === p.id} onChange={() => setSelectedNewProvider(p.id)} />
                          <span>{p.full_name}</span>
                        </div>
                        <span className="text-muted-foreground text-[10px]">★ {p.rating?.toFixed(1) ?? '—'}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="font-semibold">Reason for Reassignment</Label>
              <Textarea
                placeholder="Reason for provider change (min 5 chars)…"
                value={reassignReason}
                onChange={e => setReassignReason(e.target.value)}
                className="glass-input h-20 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialogOpen(false)} className="text-xs">Cancel</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs"
              onClick={handleReassignBooking}
              disabled={actionLoading || !selectedNewProvider}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Reassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Bookings;
