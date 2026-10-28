import { lazy, Suspense, type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useLayoutEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";

const Index = lazy(() => import("./pages/Index.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const AuthCallback = lazy(() => import("./pages/AuthCallback.tsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Services = lazy(() => import("./pages/Services.tsx"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail.tsx"));
const ProviderDetail = lazy(() => import("./pages/ProviderDetail.tsx"));
const Booking = lazy(() => import("./pages/Booking.tsx"));
const BookingConfirmation = lazy(() => import("./pages/BookingConfirmation.tsx"));
const MyBookings = lazy(() => import("./pages/MyBookings.tsx"));
const About = lazy(() => import("./pages/About.tsx"));
const Contact = lazy(() => import("./pages/Contact.tsx"));
const BecomePro = lazy(() => import("./pages/BecomePro.tsx"));
const Notifications = lazy(() => import("./pages/Notifications.tsx"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 2, retry: 0 } },
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

const AppRoutes = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previousRestoration; };
  }, []);

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center" aria-busy="true">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    }>
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
    </Suspense>
  );
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="handyfix-theme" disableTransitionOnChange>
  <QueryClientProvider client={queryClient}>
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
  </ThemeProvider>
);

export default App;
