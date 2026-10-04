import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, CheckCircle2, XCircle, Search, Eye, Loader2,
  ChevronLeft, AlertTriangle
} from 'lucide-react';
import { cn, maskAadhaar, maskPAN, KYC_REJECTION_REASONS, formatDate } from '@/lib/utils';

interface ProviderReviewItem {
  id: string;
  user_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  kyc_status: string;
  kyc_rejection_reason: string | null;
  kyc_submitted_at: string | null;
  pincodes: string[] | null;
  service_ids: string[] | null;
  experience_years: number | null;
  bio: string | null;
  created_at: string;
  is_verified: boolean;
  is_email_verified: boolean | null;
}

interface KycDocumentDetails {
  aadhaar_last4: string | null;
  pan_number: string | null;
  aadhaar_front_path: string | null;
  aadhaar_back_path: string | null;
  selfie_path: string | null;
  pan_path: string | null;
  certificate_path: string | null;
}

const KycReview: React.FC = () => {
  const { toast } = useToast();

  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [search, setSearch] = useState('');
  const [providers, setProviders] = useState<ProviderReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedProvider, setSelectedProvider] = useState<ProviderReviewItem | null>(null);
  const [kycDocs, setKycDocs] = useState<KycDocumentDetails | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [zoomImage, setZoomImage] = useState<{ url: string; label: string } | null>(null);

  const [checklist, setChecklist] = useState({
    nameMatch: false, photoMatch: false, age18: false, docsClear: false,
  });

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>(KYC_REJECTION_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('service_providers')
      .select('*')
      .eq('kyc_status', tab)
      .order('kyc_submitted_at', { ascending: true, nullsFirst: false });

    if (error) {
      toast({ title: 'Error fetching providers', description: error.message, variant: 'destructive' });
    } else {
      setProviders((data ?? []) as unknown as ProviderReviewItem[]);
    }
    setLoading(false);
  }, [tab, toast]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const selectProviderForReview = async (p: ProviderReviewItem) => {
    setSelectedProvider(p);
    setLoadingDocs(true);
    setKycDocs(null);
    setSignedUrls({});
    setChecklist({ nameMatch: false, photoMatch: false, age18: false, docsClear: false });

    const { data: docData } = await supabase
      .from('provider_kyc')
      .select('aadhaar_last4, pan_number, aadhaar_front_path, aadhaar_back_path, selfie_path, pan_path, certificate_path')
      .eq('provider_id', p.id)
      .maybeSingle();

    if (docData) {
      setKycDocs(docData as KycDocumentDetails);
      const urls: Record<string, string> = {};
      const keys: (keyof KycDocumentDetails)[] = [
        'aadhaar_front_path', 'aadhaar_back_path', 'selfie_path', 'pan_path', 'certificate_path',
      ];
      for (const k of keys) {
        const path = docData[k];
        if (path) {
          const { data: signed } = await supabase.storage.from('provider-kyc').createSignedUrl(path, 1800);
          if (signed?.signedUrl) urls[k] = signed.signedUrl;
        }
      }
      setSignedUrls(urls);
    }
    setLoadingDocs(false);
  };

  const handleApprove = async () => {
    if (!selectedProvider) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_approve_kyc', { p_provider_id: selectedProvider.id });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (res?.success === false) throw new Error(res.error ?? 'Approval failed');
      toast({ title: '✅ Application Approved', description: `${selectedProvider.full_name} is now a verified provider.` });
      setSelectedProvider(null);
      fetchProviders();
    } catch (err: unknown) {
      toast({ title: 'Approval Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedProvider) return;
    const reason = selectedReason === 'Other' ? customReason.trim() : selectedReason;
    if (!reason) {
      toast({ title: 'Reason Required', description: 'Please select or type a rejection reason.', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_reject_kyc', { p_provider_id: selectedProvider.id, p_reason: reason });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (res?.success === false) throw new Error(res.error ?? 'Rejection failed');
      toast({ title: '❌ Application Rejected', description: `Notification sent to ${selectedProvider.full_name}.` });
      setRejectDialogOpen(false);
      setSelectedProvider(null);
      fetchProviders();
    } catch (err: unknown) {
      toast({ title: 'Rejection Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = providers.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.phone?.includes(q);
  });

  const allChecklistDone = Object.values(checklist).every(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> KYC Review
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Review and verify provider onboarding applications</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={v => setTab(v as 'pending' | 'approved' | 'rejected')}>
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="pending" className="text-xs">Pending Review</TabsTrigger>
            <TabsTrigger value="approved" className="text-xs">Approved</TabsTrigger>
            <TabsTrigger value="rejected" className="text-xs">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 text-xs glass-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* List */}
        <div className="lg:col-span-5 space-y-3">
          {loading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : filtered.length === 0 ? (
            <Card className="glass-card p-8 text-center text-muted-foreground text-xs">
              No {tab} KYC applications found.
            </Card>
          ) : (
            filtered.map(p => (
              <Card
                key={p.id}
                onClick={() => selectProviderForReview(p)}
                className={cn(
                  'glass-card p-4 cursor-pointer transition-all border',
                  selectedProvider?.id === p.id ? 'border-primary bg-primary/5 shadow-gold' : 'hover:border-primary/40'
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{p.full_name}</h4>
                    <p className="text-xs text-muted-foreground">{p.email || p.phone}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Submitted: {p.kyc_submitted_at ? formatDate(p.kyc_submitted_at) : 'N/A'}
                    </p>
                  </div>
                  <Badge className={cn('text-[10px]',
                    p.kyc_status === 'approved' ? 'bg-success/20 text-success' :
                    p.kyc_status === 'rejected' ? 'bg-destructive/20 text-destructive' :
                    'bg-blue-500/20 text-blue-500'
                  )}>
                    {p.kyc_status}
                  </Badge>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-7">
          {!selectedProvider ? (
            <Card className="glass-card p-12 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[400px]">
              <Eye className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-sm">Select an application to review documents</p>
            </Card>
          ) : (
            <Card className="glass-card p-6 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                  <h3 className="text-lg font-bold">{selectedProvider.full_name}</h3>
                  <p className="text-xs text-muted-foreground">{selectedProvider.email} · {selectedProvider.phone}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>DOB: <strong>{selectedProvider.date_of_birth ?? 'N/A'}</strong></p>
                  <p>Exp: <strong>{selectedProvider.experience_years ?? 0} yrs</strong></p>
                </div>
              </div>

              {loadingDocs ? (
                <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <div className="space-y-6">
                  {/* Masked IDs */}
                  <div className="grid grid-cols-2 gap-4 bg-secondary/30 p-3 rounded-xl text-xs">
                    <div>
                      <span className="text-muted-foreground">Aadhaar Last 4:</span>
                      <p className="font-mono font-bold">{kycDocs?.aadhaar_last4 ? maskAadhaar(kycDocs.aadhaar_last4) : 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">PAN Number:</span>
                      <p className="font-mono font-bold">{kycDocs?.pan_number ? maskPAN(kycDocs.pan_number) : 'N/A'}</p>
                    </div>
                  </div>

                  {/* Documents grid */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Uploaded Documents</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: 'Selfie Portrait', url: signedUrls.selfie_path },
                        { label: 'Aadhaar Front', url: signedUrls.aadhaar_front_path },
                        { label: 'Aadhaar Back', url: signedUrls.aadhaar_back_path },
                        { label: 'PAN Card', url: signedUrls.pan_path },
                        { label: 'Certificate', url: signedUrls.certificate_path },
                      ].map((doc, idx) => (
                        <div key={idx} className="border border-border rounded-xl p-2 bg-secondary/20 text-center space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground truncate">{doc.label}</p>
                          {doc.url ? (
                            <div
                              onClick={() => setZoomImage({ url: doc.url!, label: doc.label })}
                              className="relative group h-24 rounded-lg overflow-hidden bg-black/40 cursor-pointer border border-border"
                            >
                              <img src={doc.url} alt={doc.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                <Eye className="h-5 w-5" />
                              </div>
                            </div>
                          ) : (
                            <div className="h-24 rounded-lg bg-secondary/50 flex items-center justify-center text-muted-foreground text-[10px]">
                              Not provided
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Checklist */}
                  {tab === 'pending' && (
                    <div className="space-y-3 p-4 bg-secondary/30 rounded-xl border border-border">
                      <h4 className="font-bold text-xs uppercase tracking-wider">Verification Checklist</h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {[
                          { key: 'nameMatch', label: 'Name matches ID' },
                          { key: 'photoMatch', label: 'Selfie matches ID photo' },
                          { key: 'age18', label: 'Age is 18+ years' },
                          { key: 'docsClear', label: 'Documents clear & legible' },
                        ].map(({ key, label }) => (
                          <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={checklist[key as keyof typeof checklist]}
                              onCheckedChange={v => setChecklist(c => ({ ...c, [key]: v === true }))}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {tab === 'pending' && (
                    <div className="flex gap-3">
                      <Button
                        disabled={actionLoading || !allChecklistDone}
                        onClick={handleApprove}
                        className="flex-1 bg-success hover:bg-success/90 text-white font-bold text-xs py-5"
                      >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Approve & Verify
                      </Button>
                      <Button
                        disabled={actionLoading}
                        variant="destructive"
                        onClick={() => setRejectDialogOpen(true)}
                        className="flex-1 font-bold text-xs py-5"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject Application
                      </Button>
                    </div>
                  )}

                  {/* Rejection reason shown for rejected */}
                  {tab === 'rejected' && selectedProvider.kyc_rejection_reason && (
                    <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20 text-xs text-destructive">
                      <span className="font-bold">Rejection reason: </span>
                      {selectedProvider.kyc_rejection_reason}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <Dialog open={!!zoomImage} onOpenChange={() => setZoomImage(null)}>
        <DialogContent className="bg-black/95 border-border max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-white text-sm">{zoomImage?.label}</DialogTitle>
          </DialogHeader>
          {zoomImage && (
            <div className="flex items-center justify-center p-2">
              <img src={zoomImage.url} alt={zoomImage.label} className="max-h-[75vh] w-auto object-contain rounded-lg" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Reject KYC Application</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <p className="text-muted-foreground">Select a rejection reason for <strong>{selectedProvider?.full_name}</strong>:</p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
              {KYC_REJECTION_REASONS.map(r => (
                <label
                  key={r}
                  className={cn(
                    'flex items-center justify-between p-2.5 rounded-lg border cursor-pointer',
                    selectedReason === r ? 'border-destructive bg-destructive/10 font-bold' : 'border-border'
                  )}
                >
                  <span>{r}</span>
                  <input type="radio" name="reject_reason" checked={selectedReason === r} onChange={() => setSelectedReason(r)} />
                </label>
              ))}
            </div>
            {selectedReason === 'Other' && (
              <Textarea
                placeholder="Enter detailed reason…"
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                className="glass-input h-20 text-xs"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)} className="text-xs">Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading} className="text-xs font-bold">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KycReview;
