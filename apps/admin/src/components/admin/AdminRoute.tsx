import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isAdmin, notAuthorised } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  if (notAuthorised) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="glass-card p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            This account is not authorised for the admin panel. Please contact your system administrator.
          </p>
          <a href="/login" className="inline-block text-xs text-primary underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
