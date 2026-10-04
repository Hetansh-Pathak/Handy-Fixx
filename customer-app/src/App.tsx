import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import SplashScreen from "@/components/SplashScreen";

import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import NotFound from "./pages/NotFound.tsx";
import Profile from "./pages/Profile.tsx";
import Services from "./pages/Services.tsx";
import ServiceDetail from "./pages/ServiceDetail.tsx";
import ProviderDetail from "./pages/ProviderDetail.tsx";
import Booking from "./pages/Booking.tsx";
import BookingConfirmation from "./pages/BookingConfirmation.tsx";
import MyBookings from "./pages/MyBookings.tsx";
import About from "./pages/About.tsx";
import Contact from "./pages/Contact.tsx";
import BecomePro from "./pages/BecomePro.tsx";
import Notifications from "./pages/Notifications.tsx";
import { ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 2, retry: 1 } },
});

const PrivateRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/"                        element={<Index />} />
    <Route path="/auth"                    element={<Auth />} />
    <Route path="/auth/callback"           element={<AuthCallback />} />
    <Route path="/forgot-password"         element={<ForgotPassword />} />
    <Route path="/reset-password"          element={<ResetPassword />} />
    <Route path="/services"               element={<Services />} />
    <Route path="/services/:serviceSlug"  element={<ServiceDetail />} />
    <Route path="/provider/:providerId"   element={<ProviderDetail />} />
    <Route path="/about"                  element={<About />} />
    <Route path="/contact"               element={<Contact />} />
    <Route path="/become-a-pro"          element={<BecomePro />} />
    <Route path="/profile"               element={<PrivateRoute><Profile /></PrivateRoute>} />
    <Route path="/my-bookings"           element={<PrivateRoute><MyBookings /></PrivateRoute>} />
    <Route path="/notifications"          element={<PrivateRoute><Notifications /></PrivateRoute>} />
    <Route path="/book/:serviceSlug/:providerId" element={<PrivateRoute><Booking /></PrivateRoute>} />
    <Route path="/booking-confirmation/:bookingId" element={<PrivateRoute><BookingConfirmation /></PrivateRoute>} />
    <Route path="*"                      element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SplashScreen />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <AppRoutes />
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
