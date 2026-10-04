import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import type { KycStatus } from '@/lib/constants';

interface NotificationPreferences {
  new_booking: boolean;
  booking_update: boolean;
  reviews: boolean;
  payments: boolean;
  marketing: boolean;
}

export interface ProviderProfile {
  id: string;
  user_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  is_email_verified: boolean | null;
  verified_at: string | null;
  avatar_url: string | null;
  bio: string | null;
  status: string;
  is_online: boolean | null;
  is_verified: boolean;
  kyc_status: KycStatus;
  kyc_rejection_reason: string | null;
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_reviewed_by: string | null;
  onboarding_step: number | null;
  rating: number | null;
  total_reviews: number | null;
  total_jobs: number | null;
  pincodes: string[] | null;
  service_ids: string[] | null;
  experience_years: number | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  notification_preferences: NotificationPreferences | null;
  profile_completion: number | null;
  total_earnings: number | null;
  this_month_earnings: number | null;
  acceptance_rate: number | null;
  created_at: string;
  updated_at: string;
}

interface ProviderContextType {
  provider: ProviderProfile | null;
  loading: boolean;
  isProvider: boolean;
  unreadNotificationsCount: number;
  pendingBookingsCount: number;
  toggleOnline: () => Promise<void>;
  refreshProvider: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  refreshCounts: () => Promise<void>;
}

const ProviderContext = createContext<ProviderContextType | undefined>(undefined);

export const ProviderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);

  const fetchProvider = useCallback(async () => {
    if (!user) {
      setProvider(null);
      setProviderLoading(false);
      return;
    }
    setProviderLoading(true);
    const { data } = await supabase
      .from('service_providers')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setProvider(data as unknown as ProviderProfile | null);
    setProviderLoading(false);
  }, [user]);

  useEffect(() => { fetchProvider(); }, [fetchProvider]);

  const refreshUnreadCount = useCallback(async () => {
    if (!provider) return;
    const { count } = await supabase
      .from('provider_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', provider.id)
      .eq('is_read', false);
    setUnreadNotificationsCount(count || 0);

    const { count: pendingCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', provider.id)
      .eq('status', 'pending');
    setPendingBookingsCount(pendingCount || 0);
  }, [provider]);

  // Auto-set online — ONLY for approved providers
  useEffect(() => {
    if (!provider) return;
    // Guard: only approved+active providers can go online
    if (provider.kyc_status !== 'approved' || provider.status !== 'active') return;

    const markOnline = async () => {
      const { data } = await supabase
        .from('service_providers')
        .update({ is_online: true })
        .eq('id', provider.id)
        .select()
        .single();
      if (data) setProvider(data as unknown as ProviderProfile);
    };

    markOnline();
    const heartbeat = window.setInterval(markOnline, 30_000);
    const handlePageHide = () => {
      void supabase
        .from('service_providers')
        .update({ is_online: false })
        .eq('id', provider.id);
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('pagehide', handlePageHide);
      void supabase
        .from('service_providers')
        .update({ is_online: false })
        .eq('id', provider.id);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id, provider?.kyc_status]);

  // Realtime: listen for live KYC status updates from admin
  useEffect(() => {
    if (!provider?.id) return;
    const channel = supabase
      .channel(`provider-kyc-status-${provider.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'service_providers',
        filter: `id=eq.${provider.id}`,
      }, (payload) => {
        setProvider(prev => prev ? { ...prev, ...(payload.new as Partial<ProviderProfile>) } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [provider?.id]);

  useEffect(() => {
    if (!provider) return;
    refreshUnreadCount();

    const channel = supabase.channel('provider-context-live')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'provider_notifications',
        filter: `provider_id=eq.${provider.id}`
      }, () => refreshUnreadCount())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings',
        filter: `provider_id=eq.${provider.id}`
      }, () => refreshUnreadCount())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [provider, refreshUnreadCount]);

  const toggleOnline = async () => {
    if (!provider) return;
    // Guard: DB trigger will silently reset to false anyway, but show a cleaner UX
    if (provider.kyc_status !== 'approved' || provider.status !== 'active') return;
    const newStatus = !provider.is_online;
    const { data } = await supabase
      .from('service_providers')
      .update({ is_online: newStatus })
      .eq('id', provider.id)
      .select()
      .single();
    if (data) setProvider(data as unknown as ProviderProfile);
  };

  // loading is true if auth is still resolving OR provider fetch hasn't completed
  const loading = authLoading || providerLoading;

  return (
    <ProviderContext.Provider value={{
      provider,
      loading,
      isProvider: !!provider,
      unreadNotificationsCount,
      pendingBookingsCount,
      toggleOnline,
      refreshProvider: fetchProvider,
      refreshUnreadCount,
      refreshCounts: refreshUnreadCount,
    }}>
      {children}
    </ProviderContext.Provider>
  );
};

export const useProvider = () => {
  const context = useContext(ProviderContext);
  if (!context) throw new Error('useProvider must be used within ProviderProvider');
  return context;
};