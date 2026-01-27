import { MarketingNavbar } from "@/components/marketing/MarketingNavbar";
import { HeroSection } from "@/components/marketing/HeroSection";
import { BusinessModelSection } from "@/components/marketing/BusinessModelSection";
import { ProductizationSection } from "@/components/marketing/ProductizationSection";
import { EcosystemSection } from "@/components/marketing/EcosystemSection";
import { TalentSection } from "@/components/marketing/TalentSection";
import { TrustSafetySection } from "@/components/marketing/TrustSafetySection";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNavbar />
      <main>
        <HeroSection />
        <BusinessModelSection />
        <ProductizationSection />
        <EcosystemSection />
        <TalentSection />
        <TrustSafetySection />
      </main>
      <MarketingFooter />
    </div>
  );
}
