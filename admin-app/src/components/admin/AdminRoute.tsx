import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isAdmin, notAuthorised, roleCheckFailed, retryRoleCheck, signOut } = useAdminAuth();

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

  if (user && roleCheckFailed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="glass-card p-8 max-w-sm w-full text-center space-y-4">
          <h2 className="text-lg font-bold text-foreground">Could not verify admin access</h2>
          <p className="text-sm text-muted-foreground">
            The check failed (network, or the database function has_role is missing). You are still signed in.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => void retryRoleCheck()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Retry</button>
            <button onClick={() => void signOut()} className="px-4 py-2 rounded-lg border text-sm">Sign out</button>
          </div>
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
