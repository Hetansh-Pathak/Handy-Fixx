import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';
import AdminRoute from '@/components/admin/AdminRoute';
import AdminLayout from '@/components/admin/AdminLayout';

import Login from '@/pages/admin/Login';
const Dashboard = lazy(() => import('@/pages/admin/Dashboard'));
const KycReview = lazy(() => import('@/pages/admin/KycReview'));
const Providers = lazy(() => import('@/pages/admin/Providers'));
const Bookings = lazy(() => import('@/pages/admin/Bookings'));
const AuditLog = lazy(() => import('@/pages/admin/AuditLog'));
const Payouts = lazy(() => import('@/pages/admin/Payouts'));

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/kyc" element={<KycReview />} />
              <Route path="/providers" element={<Providers />} />
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/payouts" element={<Payouts />} />
              <Route path="/audit" element={<AuditLog />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
        <SonnerToaster />
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}
