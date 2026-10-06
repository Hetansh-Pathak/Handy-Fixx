import ServicesGrid from "@/components/ServicesGrid";
import MostBooked from "@/components/MostBooked";
import PromoCards from "@/components/PromoCards";
import HowItWorks from "@/components/HowItWorks";
import WhyChoose from "@/components/WhyChoose";
import ExpertSection from "@/components/ExpertSection";
import EarnSection from "@/components/EarnSection";
import Testimonials from "@/components/Testimonials";
import CTASection from "@/components/CTASection";

/** Everything below the hero. Split into its own chunk so first paint ships far less JavaScript. */
const HomeBelowFold = () => (
  <>
    <ServicesGrid />
    <MostBooked />
    <div className="defer-render"><PromoCards /></div>
    <div className="defer-render"><HowItWorks /></div>
    <div className="defer-render"><WhyChoose /></div>
    <div className="defer-render"><ExpertSection /></div>
    <div className="defer-render"><EarnSection /></div>
    <div className="defer-render"><Testimonials /></div>
    <div className="defer-render"><CTASection /></div>
  </>
);

export default HomeBelowFold;
