import React, { useEffect, useRef, useState } from 'react';
import { useProvider } from '@/contexts/ProviderContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Plus, X, Loader2, Building2, CreditCard, Briefcase, CheckCircle2, Mail, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useNavigate } from 'react-router-dom';
import { GUJARAT_CITIES, SERVICE_ICONS } from '@/lib/constants';
import { Shield, ArrowRight, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { provider, refreshProvider } = useProvider();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [newCity, setNewCity] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [cityHighlight, setCityHighlight] = useState(-1);
  const cityWrapperRef = useRef<HTMLDivElement>(null);

  // Close city dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cityWrapperRef.current && !cityWrapperRef.current.contains(e.target as Node))
        setShowCityDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [allServices, setAllServices] = useState<any[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', bio: '', experience_years: 0,
    bank_account_name: '', bank_account_number: '', bank_ifsc: '', upi_id: '',
  });

  // Load all available services from DB
  useEffect(() => {
    (supabase as any)
      .from('services')
      .select('id, name, base_price, category')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => { if (data) setAllServices(data); });
  }, []);

  // Load existing custom prices
  useEffect(() => {
    if (!provider?.id) return;
    (supabase as any)
      .from('provider_service_pricing')
      .select('service_id, custom_price')
      .eq('provider_id', provider.id)
      .then(({ data }: { data: any[] | null }) => {
        if (data) {
          const priceMap: Record<string, number> = {};
          data.forEach(p => { priceMap[p.service_id] = p.custom_price; });
          setCustomPrices(priceMap);
        }
      });
  }, [provider?.id]);

  // Sync form + selected services when provider loads
  useEffect(() => {
    if (provider) {
      setForm({
        full_name: provider.full_name || '',
        phone: provider.phone || '',
        email: provider.email || '',
        bio: provider.bio || '',
        experience_years: provider.experience_years || 0,
        bank_account_name: provider.bank_account_name || '',
        bank_account_number: provider.bank_account_number || '',
        bank_ifsc: provider.bank_ifsc || '',
        upi_id: provider.upi_id || '',
      });
      setSelectedServiceIds((provider as any).service_ids || []);
    }
  }, [provider]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds(seconds => seconds - 1), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const getFunctionError = async (error: any, data: any) => {
    if (data?.error) return data.error;
    // Supabase wraps non-2xx function responses in a Response, so read its JSON
    // body to show the provider the useful server-side message.
    if (error?.context instanceof Response) {
      try {
        const body = await error.context.clone().json();
        if (body?.error) return body.error;
      } catch {
        // Fall through to the generic message below.
      }
    }
    return error?.message || 'Something went wrong. Please try again.';
  };

  const sendVerificationCode = async () => {
    if (!provider) return;
    const email = form.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast({ title: 'Enter a valid email address', variant: 'destructive' });
      return;
    }
    setSendingOtp(true);
    const { data, error } = await supabase.functions.invoke('send-provider-otp', {
      body: { provider_id: provider.id, email },
    });
    setSendingOtp(false);
    if (error || !data?.success) {
      toast({ title: 'Could not send code', description: await getFunctionError(error, data), variant: 'destructive' });
      return;
    }
    setOtpCode('');
    setOtpDialogOpen(true);
    setResendSeconds(45);
    toast({ title: 'Verification code sent', description: `Check ${email} for your 6-digit code.` });
  };

  const verifyEmailCode = async () => {
    if (!provider || otpCode.length !== 6) return;
    setVerifyingOtp(true);
    const { data, error } = await supabase.functions.invoke('verify-provider-otp', {
      body: { provider_id: provider.id, otp_code: otpCode },
    });
    setVerifyingOtp(false);
    if (error || !data?.success) {
      toast({ title: 'Verification failed', description: await getFunctionError(error, data), variant: 'destructive' });
      return;
    }
    setOtpDialogOpen(false);
    setOtpCode('');
    await refreshProvider();
    toast({ title: 'Email verified', description: 'Your Verified Provider badge is now live.' });
  };

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const saveCustomPrice = async (serviceId: string, price: number) => {
    if (!provider?.id || !price) return;
    await (supabase as any).from('provider_service_pricing').upsert({
      provider_id: provider.id,
      service_id: serviceId,
      custom_price: price,
      is_available: true,
    }, { onConflict: 'provider_id,service_id' });
  };

  const handleSave = async () => {
    if (!provider) return;

    if (selectedServiceIds.length === 0) {
      toast({ title: 'Select at least one service', description: 'Customers need to know what you offer.', variant: 'destructive' });
      return;
    }

    setSaving(true);

    // Completion: name + phone + bio + experience + cities + services + bank
    const filled = [
      form.full_name, form.phone, form.bio,
      Number(form.experience_years) > 0,
      (provider.pincodes && provider.pincodes.length > 0),
      selectedServiceIds.length > 0,
      (form.bank_account_number || form.upi_id),
    ];
    const completion = Math.round((filled.filter(Boolean).length / filled.length) * 100);

    const { error } = await supabase.from('service_providers').update({
      full_name: form.full_name,
      phone: form.phone,
      email: form.email,
      // A badge belongs to a specific address; changing it requires a new OTP.
      ...(form.email.trim().toLowerCase() !== (provider.email || '').trim().toLowerCase()
        ? { is_email_verified: false, verified_at: null }
        : {}),
      bio: form.bio,
      experience_years: Number(form.experience_years),
      service_ids: selectedServiceIds,
      bank_account_name: form.bank_account_name || null,
      bank_account_number: form.bank_account_number || null,
      bank_ifsc: form.bank_ifsc || null,
      upi_id: form.upi_id || null,
      profile_completion: completion,
    } as any).eq('id', provider.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Save custom prices for all selected services
    for (const serviceId of selectedServiceIds) {
      const price = customPrices[serviceId];
      if (price) await saveCustomPrice(serviceId, price);
    }

    toast({ title: 'Profile saved ✅', description: 'Services, prices, and service cities are now live.' });
    refreshProvider();
    setSaving(false);
  };

  const handleCityInput = (value: string) => {
    setNewCity(value);
    setCityHighlight(-1);
    if (value.trim().length < 2) { setCitySuggestions([]); setShowCityDropdown(false); return; }
    const lower = value.toLowerCase();
    const filtered = GUJARAT_CITIES.filter(c => c.toLowerCase().startsWith(lower)).slice(0, 8);
    setCitySuggestions(filtered);
    setShowCityDropdown(filtered.length > 0);
  };

  const addCity = async (cityName?: string) => {
    if (!provider) return;
    const city = (cityName ?? newCity).trim();
    const matched = GUJARAT_CITIES.find(c => c.toLowerCase() === city.toLowerCase());
    if (!matched) {
      toast({ title: 'City not found', description: 'Please select a valid Gujarat city.', variant: 'destructive' });
      return;
    }
    if (provider.pincodes?.includes(matched)) {
      toast({ title: 'Already added', variant: 'destructive' }); return;
    }
    const updated = [...(provider.pincodes || []), matched];
    await supabase.from('service_providers').update({ pincodes: updated }).eq('id', provider.id);
    setNewCity('');
    setCitySuggestions([]);
    setShowCityDropdown(false);
    refreshProvider();
    toast({ title: `${matched} added ✅`, description: 'Customers in this city can now find you.' });
  };

  const removeCity = async (city: string) => {
    if (!provider) return;
    const updated = (provider.pincodes || []).filter(p => p !== city);
    await supabase.from('service_providers').update({ pincodes: updated }).eq('id', provider.id);
    refreshProvider();
  };

  const handleCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showCityDropdown) { if (e.key === 'Enter') addCity(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCityHighlight(i => Math.min(i + 1, citySuggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCityHighlight(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (cityHighlight >= 0) addCity(citySuggestions[cityHighlight]); else addCity(); }
    else if (e.key === 'Escape') setShowCityDropdown(false);
  };

  const update = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile completion */}
      {provider && (
        <Card className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Profile Completion</span>
            <span className="text-sm text-primary font-semibold">{provider.profile_completion || 0}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full gold-gradient rounded-full transition-all" style={{ width: `${provider.profile_completion || 0}%` }} />
          </div>
          {selectedServiceIds.length === 0 && (
            <p className="text-xs text-warning mt-2">⚠️ Select services below to appear in customer search</p>
          )}
        </Card>
      )}

      {/* Basic Info */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass-card p-4 space-y-4">
          <h3 className="font-semibold">Basic Information</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 flex items-center gap-1.5">Full Name
                {provider?.is_email_verified && <VerifiedBadge />}
              </label>
              <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} className="glass-input" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Phone</label>
              <Input value={form.phone} onChange={e => update('phone', e.target.value)} className="glass-input" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-sm text-muted-foreground">Email</label>
                {provider?.is_email_verified ? (
                  <VerifiedBadge />
                ) : (
                  <Button type="button" variant="ghost" size="sm" className="h-auto px-0 text-primary hover:text-primary" onClick={sendVerificationCode} disabled={sendingOtp}>
                    {sendingOtp ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1 h-3.5 w-3.5" />}
                    Verify Email
                  </Button>
                )}
              </div>
              <Input value={form.email} onChange={e => update('email', e.target.value)} className="glass-input" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Experience (years)</label>
              <Input type="number" value={form.experience_years} onChange={e => update('experience_years', e.target.value)} className="glass-input" />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Bio</label>
            <Textarea value={form.bio} onChange={e => update('bio', e.target.value)} className="glass-input min-h-[80px]"
              placeholder="Tell customers about your expertise..." />
          </div>
        </Card>
      </motion.div>

      {/* ══ SERVICES YOU OFFER ══════════════════════════════
          This is what makes the provider appear in customer search.
          service_ids[] is saved to the DB on profile save.
          ═══════════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card className="glass-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Services You Offer</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Select every service you provide. You will <strong>only appear in customer search</strong> for selected services.
          </p>

          {allServices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading services...</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {allServices.map(service => {
                const isSelected = selectedServiceIds.includes(service.id);
                return (
                  <div
                    key={service.id}
                    className={cn(
                      'flex flex-col p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer',
                      isSelected
                        ? 'border-primary/60 bg-primary/10 text-foreground'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/30 hover:bg-secondary/60'
                    )}
                    onClick={() => toggleService(service.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg shrink-0">
                        {SERVICE_ICONS[service.name] || '🔧'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs font-semibold truncate', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                          {service.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Base ₹{service.base_price}</p>
                      </div>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Custom price input — only when selected */}
                    {isSelected && (
                      <div className="mt-2 pt-2 border-t border-primary/20" onClick={e => e.stopPropagation()}>
                        <p className="text-[9px] text-muted-foreground mb-1">Your price (₹)</p>
                        <input
                          type="number"
                          value={customPrices[service.id] ?? service.base_price ?? ''}
                          onChange={e => setCustomPrices(prev => ({ ...prev, [service.id]: Number(e.target.value) }))}
                          onBlur={e => saveCustomPrice(service.id, Number(e.target.value))}
                          className="w-full bg-background border border-primary/30 rounded-lg px-2 py-1 text-xs text-primary font-bold outline-none focus:border-primary"
                          min={0}
                          placeholder={`₹${service.base_price}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className={cn('text-xs mt-3', selectedServiceIds.length > 0 ? 'text-success' : 'text-warning')}>
            {selectedServiceIds.length > 0
              ? `✅ ${selectedServiceIds.length} service${selectedServiceIds.length > 1 ? 's' : ''} selected`
              : '⚠️ No services selected — customers cannot find you'}
          </p>
        </Card>
      </motion.div>

      {/* Service Cities */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card className="glass-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Service Cities (Gujarat)</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Customers search by city. Add every Gujarat city you serve — you will appear in search results for those cities.
          </p>

          {/* Added cities tags */}
          <div className="flex flex-wrap gap-2 mb-3">
            {(provider?.pincodes || []).map(city => (
              <span key={city} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary font-semibold">
                <MapPin className="h-3 w-3 opacity-60" />
                {city}
                <button onClick={() => removeCity(city)} className="text-primary/50 hover:text-destructive transition-colors ml-1">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {(!provider?.pincodes || provider.pincodes.length === 0) && (
              <p className="text-sm text-muted-foreground">No cities added yet</p>
            )}
          </div>

          {/* City autocomplete input */}
          <div ref={cityWrapperRef} className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={newCity}
                  onChange={e => handleCityInput(e.target.value)}
                  onKeyDown={handleCityKeyDown}
                  onFocus={() => newCity.trim().length >= 2 && setShowCityDropdown(citySuggestions.length > 0)}
                  className="glass-input pl-9"
                  placeholder="Type city name (e.g. Jamnagar)"
                  autoComplete="off"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => addCity()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Dropdown */}
            <AnimatePresence>
              {showCityDropdown && (
                <motion.ul
                  initial={{ opacity: 0, y: -4, scaleY: 0.95 }}
                  animate={{ opacity: 1, y: 0, scaleY: 1 }}
                  exit={{ opacity: 0, y: -4, scaleY: 0.95 }}
                  transition={{ duration: 0.13 }}
                  className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border shadow-lg overflow-hidden"
                  style={{ background: 'hsl(var(--card))', transformOrigin: 'top' }}
                >
                  {citySuggestions.map((city, idx) => (
                    <li
                      key={city}
                      onMouseDown={() => addCity(city)}
                      onMouseEnter={() => setCityHighlight(idx)}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm font-medium transition-colors"
                      style={{
                        background: idx === cityHighlight ? 'hsl(22 61% 47% / 0.1)' : 'transparent',
                        color: idx === cityHighlight ? 'hsl(22 61% 47%)' : 'hsl(var(--foreground))',
                        borderBottom: idx < citySuggestions.length - 1 ? '1px solid hsl(var(--border))' : 'none',
                      }}
                    >
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                      <span>
                        <span style={{ color: 'hsl(22 61% 47%)', fontWeight: 700 }}>
                          {city.substring(0, newCity.length)}
                        </span>
                        {city.substring(newCity.length)}
                      </span>
                      <span
                        className="ml-auto text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'hsl(22 61% 47% / 0.1)', color: 'hsl(22 61% 47%)' }}
                      >
                        Gujarat
                      </span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </motion.div>

      {/* Bank Details */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <Card className="glass-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Bank Details</h3>
          </div>
          <p className="text-xs text-muted-foreground">Used for weekly payouts. Securely stored.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Account Holder Name</label>
              <Input value={form.bank_account_name} onChange={e => update('bank_account_name', e.target.value)} className="glass-input" placeholder="As on bank account" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Account Number</label>
              <Input value={form.bank_account_number} onChange={e => update('bank_account_number', e.target.value)} className="glass-input" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">IFSC Code</label>
              <Input value={form.bank_ifsc} onChange={e => update('bank_ifsc', e.target.value.toUpperCase())} className="glass-input" placeholder="e.g. HDFC0001234" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">UPI ID (Optional)</label>
              <Input value={form.upi_id} onChange={e => update('upi_id', e.target.value)} className="glass-input" placeholder="name@upi" />
            </div>
          </div>
          {provider?.bank_account_number && (
            <div className="flex items-center gap-2 text-xs text-success">
              <CreditCard className="h-3.5 w-3.5" />
              Bank details saved · **** {provider.bank_account_number.slice(-4)}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Save */}
      <Button className="gold-gradient text-primary-foreground font-semibold w-full h-11" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save Profile
      </Button>

      <Dialog open={otpDialogOpen} onOpenChange={open => { setOtpDialogOpen(open); if (!open) setOtpCode(''); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Verify your email</DialogTitle>
            <DialogDescription>Enter the 6-digit code sent to {form.email.trim()}.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-3">
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} disabled={verifyingOtp}>
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button className="gold-gradient text-primary-foreground" onClick={verifyEmailCode} disabled={verifyingOtp || otpCode.length !== 6}>
            {verifyingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify
          </Button>
          <button type="button" className="text-sm text-primary disabled:text-muted-foreground" onClick={sendVerificationCode} disabled={sendingOtp || resendSeconds > 0}>
            {sendingOtp ? 'Sending code...' : resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const VerifiedBadge = () => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-500"><CheckCircle2 className="h-4 w-4 fill-green-500/10" /> Verified</span>
      </TooltipTrigger>
      <TooltipContent>Verified Provider</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default Profile;
