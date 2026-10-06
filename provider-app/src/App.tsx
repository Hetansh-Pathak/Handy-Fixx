import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProviderProvider } from "@/contexts/ProviderContext";
import SplashScreen from "@/components/SplashScreen";
import Index from "./pages/Index.tsx";
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
import ProviderLogin from "./pages/provider/ProviderLogin";
import AuthCallback from "./pages/provider/AuthCallback";
import ProviderLayout from "./components/provider/ProviderLayout";
import ProviderRoute from "./components/provider/ProviderRoute";
const ProviderRecovery = lazy(() => import("./pages/provider/ProviderRecovery"));
const Dashboard = lazy(() => import("./pages/provider/Dashboard"));
const Bookings = lazy(() => import("./pages/provider/Bookings"));
const Earnings = lazy(() => import("./pages/provider/Earnings"));
const Schedule = lazy(() => import("./pages/provider/Schedule"));
const Reviews = lazy(() => import("./pages/provider/Reviews"));
const Notifications = lazy(() => import("./pages/provider/Notifications"));
const Profile = lazy(() => import("./pages/provider/Profile"));
const ProviderSettings = lazy(() => import("./pages/provider/ProviderSettings"));
const KycOnboarding = lazy(() => import("./pages/provider/KycOnboarding"));
const TermsAndConditions = lazy(() => import("./pages/provider/TermsAndConditions"));
import AdminRedirectNotice from "./components/admin/AdminRedirectNotice";


const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SplashScreen />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <ProviderProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/provider-login" element={<ProviderLogin />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/forgot-password" element={<ProviderRecovery />} />
              <Route path="/reset-password" element={<ProviderRecovery />} />
              <Route path="/provider-panel" element={<ProviderRoute><ProviderLayout /></ProviderRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="onboarding" element={<KycOnboarding />} />
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
);

export default App;
