import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import TrustSection from "@/components/landing/TrustSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import DeveloperSection from "@/components/landing/DeveloperSection";
import PricingSection from "@/components/landing/PricingSection";
import FaqSection from "@/components/landing/FaqSection";
import CtaSection from "@/components/landing/CtaSection";
import LandingFooter from "@/components/landing/LandingFooter";
import { PageTransition } from "@/components/layout/PageTransition";

export default function LandingPage() {
  return (
    <PageTransition>
      <div className="min-h-svh bg-background text-foreground overflow-x-hidden">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <LandingNavbar />
        <HeroSection />
        <TrustSection />
        <FeaturesSection />
        <HowItWorksSection />
        <DeveloperSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
        <LandingFooter />
      </div>
    </PageTransition>
  );
}
