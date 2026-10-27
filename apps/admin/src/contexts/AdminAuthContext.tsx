import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AdminAuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  notAuthorised: boolean;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notAuthorised, setNotAuthorised] = useState(false);

  const checkAdminRole = async (uid: string) => {
    try {
      const { data } = await supabase.rpc('has_role', { p_user_id: uid, p_role: 'admin' });
      if (data === true) {
        setIsAdmin(true);
        setNotAuthorised(false);
      } else {
        // Not admin — sign out immediately
        setIsAdmin(false);
        setNotAuthorised(true);
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
      }
    } catch {
      setIsAdmin(false);
      setNotAuthorised(true);
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminRole(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminRole(session.user.id);
      } else {
        setIsAdmin(false);
        setNotAuthorised(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setNotAuthorised(false);
  };

  return (
    <AdminAuthContext.Provider value={{ user, session, loading, isAdmin, notAuthorised, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
};
