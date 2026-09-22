import { MarketingNav } from '@/components/marketing/marketing-nav'
import { HeroSection } from '@/components/marketing/hero-section'
import { TrustStrip } from '@/components/marketing/trust-strip'
import { FeaturesSection } from '@/components/marketing/features-section'
import { OwnerPortalSection } from '@/components/marketing/owner-portal-section'
import { PricingSection } from '@/components/marketing/pricing-section'
import { FaqSection } from '@/components/marketing/faq-section'
import { FinalCta } from '@/components/marketing/final-cta'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { ContactWidget } from '@/components/marketing/contact-widget'
import { StructuredData } from '@/components/marketing/structured-data'
import { getPriceOverrides } from '@/lib/billing/plan-prices'

// The public marketing site shown at `/` to logged-out visitors. Authenticated
// users are routed to their portal by app/page.tsx before this renders.
export async function LandingPage() {
  // Operator price overrides so the public pricing grid matches checkout.
  const overrides = await getPriceOverrides()
  return (
    <div className="min-h-dvh bg-background">
      <StructuredData />
      <MarketingNav />
      <main>
        <HeroSection />
        <TrustStrip />
        <FeaturesSection />
        <OwnerPortalSection />
        <PricingSection overrides={overrides} />
        <FaqSection />
        <FinalCta />
      </main>
      <MarketingFooter />
      <ContactWidget />
    </div>
  )
}
