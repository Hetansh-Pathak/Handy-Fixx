import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProviderProvider } from "@/contexts/ProviderContext";
import SplashScreen from "@/components/SplashScreen";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ProviderLogin from "./pages/provider/ProviderLogin";
import AuthCallback from "./pages/provider/AuthCallback";
import ProviderLayout from "./components/provider/ProviderLayout";
import ProviderRoute from "./components/provider/ProviderRoute";
import AdminRoute from "./components/provider/AdminRoute";
import Dashboard from "./pages/provider/Dashboard";
import Bookings from "./pages/provider/Bookings";
import Earnings from "./pages/provider/Earnings";
import Schedule from "./pages/provider/Schedule";
import Reviews from "./pages/provider/Reviews";
import Notifications from "./pages/provider/Notifications";
import Profile from "./pages/provider/Profile";
import ProviderSettings from "./pages/provider/ProviderSettings";
import KycOnboarding from "./pages/provider/KycOnboarding";
import TermsAndConditions from "./pages/provider/TermsAndConditions";
import AdminKycReview from "./pages/admin/AdminKycReview";
import AdminRedirectNotice from "./components/admin/AdminRedirectNotice";

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
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/provider-login" element={<ProviderLogin />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
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
          </BrowserRouter>
        </ProviderProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
