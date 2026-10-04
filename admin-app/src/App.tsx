import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';
import AdminRoute from '@/components/admin/AdminRoute';
import AdminLayout from '@/components/admin/AdminLayout';

import Login from '@/pages/admin/Login';
import Dashboard from '@/pages/admin/Dashboard';
import KycReview from '@/pages/admin/KycReview';
import Providers from '@/pages/admin/Providers';
import Bookings from '@/pages/admin/Bookings';
import AuditLog from '@/pages/admin/AuditLog';

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
              <Route path="/audit" element={<AuditLog />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
        <SonnerToaster />
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}
