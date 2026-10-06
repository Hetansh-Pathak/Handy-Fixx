import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AdminAuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  notAuthorised: boolean;
  roleCheckFailed: boolean;
  retryRoleCheck: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notAuthorised, setNotAuthorised] = useState(false);
  const [roleCheckFailed, setRoleCheckFailed] = useState(false);
  // The user id whose admin role was already confirmed, so token refreshes do not re-check (and cannot sign out).
  const verifiedUid = useRef<string | null>(null);

  const checkAdminRole = useCallback(async (uid: string) => {
    const { data, error } = await supabase.rpc('has_role', { p_user_id: uid, p_role: 'admin' });
    if (error) {
      // A network blip or a missing function is NOT proof that this person is not an admin. The old code signed
      // the admin out on any error. Keep the session and let the route offer a retry instead.
      console.error('[admin] has_role check failed:', error);
      setIsAdmin(false);
      setRoleCheckFailed(true);
      return;
    }
    setRoleCheckFailed(false);
    if (data === true) {
      verifiedUid.current = uid;
      setIsAdmin(true);
      setNotAuthorised(false);
    } else {
      verifiedUid.current = null;
      setIsAdmin(false);
      setNotAuthorised(true);
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminRole(session.user.id).finally(() => alive && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        verifiedUid.current = null;
        setIsAdmin(false);
        return;
      }
      // Token refreshes and the initial-session echo of getSession() need no new role check.
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') return;
      if (verifiedUid.current === session.user.id) return;
      // Calling supabase from inside this callback can deadlock the auth lock; run it after the callback returns.
      setTimeout(() => { void checkAdminRole(session.user.id); }, 0);
    });

    return () => { alive = false; subscription.unsubscribe(); };
  }, [checkAdminRole]);

  const retryRoleCheck = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    await checkAdminRole(user.id);
    setLoading(false);
  }, [user, checkAdminRole]);

  const signOut = async () => {
    verifiedUid.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setNotAuthorised(false);
    setRoleCheckFailed(false);
  };

  return (
    <AdminAuthContext.Provider value={{ user, session, loading, isAdmin, notAuthorised, roleCheckFailed, retryRoleCheck, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
};
