import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import StatsBar from "@/components/StatsBar";
import ServicesGrid from "@/components/ServicesGrid";
import MostBooked from "@/components/MostBooked";
import PromoCards from "@/components/PromoCards";
import HowItWorks from "@/components/HowItWorks";
import WhyChoose from "@/components/WhyChoose";
import ExpertSection from "@/components/ExpertSection";
import EarnSection from "@/components/EarnSection";
import Testimonials from "@/components/Testimonials";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { toast } = useToast();

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <StatsBar />
      <ServicesGrid />
      <MostBooked />
      <PromoCards />
      <HowItWorks />
      <WhyChoose />
      <ExpertSection />
      <EarnSection />
      <Testimonials />
      <CTASection />
      <Footer />
    </div>
  );
};

export default Index;
