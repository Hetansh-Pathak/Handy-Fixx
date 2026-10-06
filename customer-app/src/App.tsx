import { lazy, ReactNode, Suspense } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import SplashScreen from "@/components/SplashScreen";
import AppShell from "@/components/shell/AppShell";
import PageSkeleton from "@/components/shell/PageSkeleton";
import { persistOptions, queryClient } from "@/lib/queryClient";
import { pageLoaders } from "@/lib/routeModules";

import Index from "./pages/Index.tsx";

const Auth = lazy(pageLoaders.auth);
const AuthCallback = lazy(pageLoaders.authCallback);
const ForgotPassword = lazy(pageLoaders.forgotPassword);
const ResetPassword = lazy(pageLoaders.resetPassword);
const NotFound = lazy(pageLoaders.notFound);
const Profile = lazy(pageLoaders.profile);
const Services = lazy(pageLoaders.services);
const ServiceDetail = lazy(pageLoaders.serviceDetail);
const ProviderDetail = lazy(pageLoaders.providerDetail);
const Booking = lazy(pageLoaders.booking);
const BookingConfirmation = lazy(pageLoaders.bookingConfirmation);
const MyBookings = lazy(pageLoaders.myBookings);
const About = lazy(pageLoaders.about);
const Contact = lazy(pageLoaders.contact);
const BecomePro = lazy(pageLoaders.becomePro);
const Notifications = lazy(pageLoaders.notifications);
const DeleteAccount = lazy(pageLoaders.deleteAccount);
const Legal = lazy(pageLoaders.legal);

const PrivateRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSkeleton />;
  if (!user) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <>{children}</>;
};

const AppRoutes = () => (
  <Suspense fallback={<PageSkeleton />}>
    <Routes>
      {/* Full-screen auth flows live outside the shell (no navbar / tab bar). */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<Index />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:serviceSlug" element={<ServiceDetail />} />
        <Route path="/provider/:providerId" element={<ProviderDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/become-a-pro" element={<BecomePro />} />
        <Route path="/delete-account" element={<DeleteAccount />} />
        <Route path="/privacy" element={<Legal />} />
        <Route path="/terms" element={<Legal />} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/my-bookings" element={<PrivateRoute><MyBookings /></PrivateRoute>} />
        <Route path="/notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />
        <Route path="/book/:serviceSlug/:providerId" element={<PrivateRoute><Booking /></PrivateRoute>} />
        <Route path="/booking-confirmation/:bookingId" element={<PrivateRoute><BookingConfirmation /></PrivateRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  </Suspense>
);

const App = () => (
  <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
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
  </PersistQueryClientProvider>
);

export default App;
