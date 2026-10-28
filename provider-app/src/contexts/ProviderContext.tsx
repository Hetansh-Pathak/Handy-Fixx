import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
  toggleOnline: (isOnline: boolean) => Promise<void>;
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
  const loadedUserId = useRef<string | null>(null);

  const fetchProvider = useCallback(async () => {
    if (!user) {
      loadedUserId.current = null;
      setProvider(null);
      setProviderLoading(false);
      return;
    }
    if (loadedUserId.current !== user.id) setProviderLoading(true);
    const { data } = await supabase
      .from('service_providers')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setProvider(data as unknown as ProviderProfile | null);
    loadedUserId.current = user.id;
    setProviderLoading(false);
  }, [user]);

  useEffect(() => { fetchProvider(); }, [fetchProvider]);

  const refreshUnreadCount = useCallback(async () => {
    if (!provider) return;
    const [notifications, bookings] = await Promise.all([
      supabase
        .from('provider_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', provider.id)
        .eq('is_read', false),
      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', provider.id)
        .eq('status', 'pending'),
    ]);
    setUnreadNotificationsCount(notifications.count || 0);
    setPendingBookingsCount(bookings.count || 0);
  }, [provider]);

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

  const toggleOnline = async (isOnline: boolean) => {
    if (!provider) throw new Error('Provider profile is unavailable. Refresh and try again.');

    const { data: latestData, error: latestError } = await supabase
      .from('service_providers')
      .select('id, user_id, kyc_status, status, is_online')
      .eq('id', provider.id)
      .eq('user_id', provider.user_id)
      .single();
    if (latestError) throw latestError;
    if (!latestData) throw new Error('Could not verify the latest provider account status. Refresh and try again.');

    setProvider(current => current?.id === latestData.id
      ? { ...current, ...latestData }
      : current);

    if (isOnline) {
      if (latestData.kyc_status !== 'approved') {
        throw new Error(`Your verification status is "${latestData.kyc_status}". It must be approved before you can go online.`);
      }
      if (latestData.status !== 'active') {
        throw new Error(`Your provider account status is "${latestData.status.replaceAll('_', ' ')}". Contact support to reactivate it.`);
      }
    }
    if (latestData.is_online === isOnline) return;

    const { data, error } = await supabase.rpc('set_provider_online', {
      p_is_online: isOnline,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new Error(
          'Online mode is not configured in the database yet. Apply database/migrations/provider/20261026000000_provider_online_status_repair.sql, then reload the Provider app.'
        );
      }
      throw error;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.is_online !== 'boolean') {
      throw new Error('The database returned an invalid online-status response. Refresh and try again.');
    }

    setProvider(current => current?.id === provider.id
      ? { ...current, is_online: data.is_online }
      : current);
    if (data.is_online !== isOnline) {
      throw new Error(
        `Database kept your provider ${data.is_online ? 'online' : 'offline'} (verification: "${latestData.kyc_status}", account: "${latestData.status}").`
      );
    }
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