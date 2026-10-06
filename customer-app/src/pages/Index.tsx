import { lazy, Suspense, useEffect } from "react";
import HeroSection from "@/components/HeroSection";
import StatsBar from "@/components/StatsBar";
import HomeApp from "@/components/home/HomeApp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";

const BelowFold = lazy(() => import("@/components/HomeBelowFold"));

const Index = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    const raw = sessionStorage.getItem("booking-toast");
    if (!raw) return;

    try {
      const payload = JSON.parse(raw) as { providerName?: string; dateTime?: string };
      toast({
        title: "Booking Confirmed!",
        description: `${payload.providerName ?? "Your provider"} will arrive on ${payload.dateTime ?? "your selected slot"}.`,
      });
    } finally {
      sessionStorage.removeItem("booking-toast");
    }
  }, [toast]);

  if (isMobile) return <HomeApp />;

  return (
    <div className="bg-background">
      <HeroSection />
      <StatsBar />
      <Suspense fallback={<div className="h-96" aria-hidden />}>
        <BelowFold />
      </Suspense>
    </div>
  );
};

export default Index;
