import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

/**
 * AdminRoute — only users with the 'admin' role in user_roles can enter.
 * All other users are redirected to the provider panel.
 */
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    const checkAdmin = async () => {
      try {
        const { data } = await supabase.rpc('has_role', { p_user_id: user.id, p_role: 'admin' });
        setIsAdmin(data === true);
      } catch {
        setIsAdmin(false);
      }
    };
    void checkAdmin();
  }, [user]);

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/provider-login" replace />;
  if (!isAdmin) return <Navigate to="/provider-panel" replace />;

  return <>{children}</>;
};

export default AdminRoute;
