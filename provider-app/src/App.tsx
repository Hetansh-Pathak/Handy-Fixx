import { lazy, Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProviderProvider } from "@/contexts/ProviderContext";
import ProviderRoute from "./components/provider/ProviderRoute";
import AdminRoute from "./components/provider/AdminRoute";
import AdminRedirectNotice from "./components/admin/AdminRedirectNotice";

const Index = lazy(() => import("./pages/Index.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const ProviderLogin = lazy(() => import("./pages/provider/ProviderLogin"));
const AuthCallback = lazy(() => import("./pages/provider/AuthCallback"));
const ProviderLayout = lazy(() => import("./components/provider/ProviderLayout"));
const Dashboard = lazy(() => import("./pages/provider/Dashboard"));
const Bookings = lazy(() => import("./pages/provider/Bookings"));
const Earnings = lazy(() => import("./pages/provider/Earnings"));
const Schedule = lazy(() => import("./pages/provider/Schedule"));
const Reviews = lazy(() => import("./pages/provider/Reviews"));
const Notifications = lazy(() => import("./pages/provider/Notifications"));
const Profile = lazy(() => import("./pages/provider/Profile"));
const ProviderSettings = lazy(() => import("./pages/provider/ProviderSettings"));
const TermsAndConditions = lazy(() => import("./pages/provider/TermsAndConditions"));

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="handyfix-theme" disableTransitionOnChange>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <ProviderProvider>
          <BrowserRouter>
            <Suspense fallback={
              <div className="min-h-screen bg-background flex items-center justify-center" aria-busy="true">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            }>
              <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/provider-login" element={<ProviderLogin />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/provider-panel" element={<ProviderRoute><ProviderLayout /></ProviderRoute>}>
                <Route index element={<Dashboard />} />
                <Route
                  path="onboarding"
                  element={<Navigate to="/provider-panel" replace state={{ openKycOnboarding: true }} />}
                />
                <Route path="terms" element={<TermsAndConditions />} />
                <Route path="bookings" element={<Bookings />} />
                <Route path="earnings" element={<Earnings />} />
                <Route path="schedule" element={<Schedule />} />
                <Route path="reviews" element={<Reviews />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<ProviderSettings />} />
              </Route>
              <Route
                path="/admin/kyc-review"
                element={<AdminRedirectNotice />}
              />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ProviderProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
