import {
  readRoleFromMetadata, resolveAppRole, type AppRole, type RoleResolution,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { googleSignOut } from "@/lib/google-auth";
import { getSupabase } from "@/lib/supabase";

export type ProviderRow = {
  id: string;
  full_name: string;
  status: string;
  kyc_status: string;
  phone: string | null;
  email: string | null;
  is_online: boolean | null;
  /** When the pro was approved: the fee-free launch period is counted from here. */
  kyc_reviewed_at: string | null;
  total_jobs: number | null;
  rating: number | string | null;
  acceptance_rate: number | string | null;
};

export type SessionStatus = "loading" | "signed_out" | "ready" | "error" | "misconfigured";

type SessionContextValue = {
  status: SessionStatus;
  errorMessage: string | null;
  session: Session | null;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  role: AppRole | null;
  roleResolution: RoleResolution | null;
  provider: ProviderRow | null;
  /**
   * True while a password-reset link is being used. The link creates a session so the password can
   * be changed, but the user must stay on the reset screen: while this is on the provider reports
   * signed-out so the route guards do not move them to role-pick or their home.
   */
  recovering: boolean;
  setRecovering: (value: boolean) => void;
  /** Re-reads the auth user and the provider row (call after picking a role). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export const providerRowKey = (userId: string | null) => ["provider-row", userId] as const;

function useSupabaseOrError() {
  return useMemo(() => {
    try {
      return { client: getSupabase(), error: null as string | null };
    } catch (e) {
      return { client: null, error: e instanceof Error ? e.message : "Supabase is not configured." };
    }
  }, []);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { client, error: configError } = useSupabaseOrError();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!client) return;
    // Subscribe first so no event between mount and getSession is missed. Only set state in the
    // callback: awaiting other Supabase calls inside it can deadlock the auth client.
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    return () => subscription.unsubscribe();
  }, [client]);

  // React Native has no tab-focus event: pause token refresh in the background, resume on foreground.
  useEffect(() => {
    if (!client) return;
    void client.auth.startAutoRefresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
    return () => {
      sub.remove();
      void client.auth.stopAutoRefresh();
    };
  }, [client]);

  const userId = session?.user.id ?? null;

  const providerQuery = useQuery({
    queryKey: providerRowKey(userId),
    enabled: !!client && !!userId && !recovering,
    retry: 2,
    queryFn: async (): Promise<ProviderRow | null> => {
      const { data, error } = await client!
        .from("service_providers")
        .select("id, full_name, status, kyc_status, phone, email, is_online, kyc_reviewed_at, total_jobs, rating, acceptance_rate")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ProviderRow | null) ?? null;
    },
  });

  const refresh = useCallback(async () => {
    if (!client) return;
    const { data } = await client.auth.getUser();
    if (data.user) setSession((prev) => (prev ? { ...prev, user: data.user } : prev));
    await queryClient.invalidateQueries({ queryKey: providerRowKey(userId) });
  }, [client, queryClient, userId]);

  const signOut = useCallback(async () => {
    await googleSignOut();
    await client?.auth.signOut();
    setSession(null);
    queryClient.clear();
  }, [client, queryClient]);

  const value = useMemo<SessionContextValue>(() => {
    let status: SessionStatus;
    if (configError) status = "misconfigured";
    else if (!sessionLoaded) status = "loading";
    else if (!session || recovering) status = "signed_out";
    // A network failure must never look like "no provider account" (it would send a pro to role-pick).
    else if (providerQuery.isError) status = "error";
    else if (providerQuery.isPending) status = "loading";
    else status = "ready";

    const provider = providerQuery.data ?? null;
    const roleResolution =
      status === "ready"
        ? resolveAppRole({ metadataRole: readRoleFromMetadata(session?.user.user_metadata), hasProviderRow: !!provider })
        : null;
    const meta = session?.user.user_metadata as { full_name?: string; display_name?: string } | undefined;

    return {
      status,
      errorMessage: configError ?? (providerQuery.isError ? "We could not load your account." : null),
      session,
      userId,
      email: session?.user.email ?? null,
      fullName: provider?.full_name ?? meta?.full_name ?? meta?.display_name ?? null,
      role: roleResolution?.role ?? null,
      roleResolution,
      provider,
      recovering,
      setRecovering,
      refresh,
      signOut,
    };
  }, [configError, sessionLoaded, session, recovering, providerQuery.isError, providerQuery.isPending, providerQuery.data, userId, refresh, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
