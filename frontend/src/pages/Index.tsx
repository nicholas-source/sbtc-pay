import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import PricingSection from "@/components/landing/PricingSection";
import LandingFooter from "@/components/landing/LandingFooter";
import { PageTransition } from "@/components/layout/PageTransition";

export default function LandingPage() {
  return (
    <PageTransition>
      <div className="min-h-svh bg-background text-foreground overflow-x-hidden">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <LandingNavbar />
        <HeroSection />
        <FeaturesSection />
        <PricingSection />
        <LandingFooter />
      </div>
    </PageTransition>
  );
}
