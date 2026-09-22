import { PLANS } from '@/lib/plans'
import { applyPriceOverrides, periodPricing } from '@/lib/pricing'
import { getPriceOverrides } from '@/lib/billing/plan-prices'
import { FAQS } from '@/components/marketing/faq-section'

const SITE_URL = 'https://www.stayknit.org'

// Server-rendered JSON-LD for the public landing page. Emits an Organization,
// the StayKnit SoftwareApplication (with a live "from" price that matches the
// pricing grid), and an FAQPage built from the same FAQS shown on the page —
// giving Google the signals it needs for org, product, and FAQ rich results.
export async function StructuredData() {
  // Same computation the pricing grid uses, so the advertised price stays in
  // sync: lowest paid tier, ZAR, yearly (the page's default view).
  const overrides = await getPriceOverrides()
  const plans = PLANS.map((plan) => applyPriceOverrides(plan, overrides))
  const paidPlans = plans.filter((plan) => !plan.custom && plan.key !== 'trial')
  const fromCents = Math.min(
    ...paidPlans.map((plan) => periodPricing(plan, 'zar', 'yearly').effectivePerMonthCents),
  )
  const lowPrice = (fromCents / 100).toFixed(2)

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'StayKnit',
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
        description:
          'Zero-commission channel manager for short-stay and vacation rentals.',
        contactPoint: [
          {
            '@type': 'ContactPoint',
            email: 'support@stayknit.org',
            contactType: 'customer support',
            availableLanguage: 'English',
          },
          {
            '@type': 'ContactPoint',
            email: 'info@stayknit.org',
            contactType: 'sales',
            availableLanguage: 'English',
          },
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'StayKnit',
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage: 'en',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: 'StayKnit',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: SITE_URL,
        publisher: { '@id': `${SITE_URL}/#organization` },
        description:
          'StayKnit syncs availability across Airbnb, Booking.com, Vrbo, LekkerSlaap and 40+ channels so short-stay rentals never double-book, with owner portals, statements and payouts on a flat monthly fee.',
        featureList: [
          'Two-way calendar sync across Airbnb, Booking.com, Vrbo and 40+ channels',
          'Double-booking prevention',
          'Read-only owner portals with monthly statements',
          'Flat monthly pricing with zero booking commission',
          'Secure billing via Paystack',
        ],
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'ZAR',
          lowPrice,
          offerCount: paidPlans.length,
          availability: 'https://schema.org/InStock',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: FAQS.map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.a,
          },
        })),
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe here: all values are our own static
      // strings / computed numbers, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  )
}
