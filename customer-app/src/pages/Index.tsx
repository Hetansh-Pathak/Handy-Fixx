import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import StatsBar from "@/components/StatsBar";
import ServicesGrid from "@/components/ServicesGrid";
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
      const payload = JSON.parse(raw) as { dateTime?: string };
      toast({
        title: "Booking request created",
        description: payload.dateTime
          ? `Your service request was submitted for ${payload.dateTime}.`
          : "Your service request was submitted.",
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
