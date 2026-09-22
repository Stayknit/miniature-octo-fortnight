import type { Metadata } from 'next'
import { LegalShell, Section } from '@/components/legal/legal-shell'

export const metadata: Metadata = {
  title: 'Cookie Policy — StayKnit',
  description: 'The cookies and similar technologies StayKnit uses, and how to control them.',
}

export default function CookiePolicyPage() {
  return (
    <LegalShell title="Cookie Policy">
      <p>
        This policy explains the cookies and similar technologies StayKnit uses. A cookie is a small file stored on your
        device; we use them sparingly and only for the purposes below.
      </p>

      <Section heading="Essential cookies">
        <p>
          These are required for the Service to work and cannot be switched off. They keep you signed in (a secure,
          HttpOnly session cookie) and protect against cross-site request forgery. Because they are strictly necessary,
          they do not require consent.
        </p>
      </Section>

      <Section heading="Analytics">
        <p>
          We use Vercel Analytics to understand aggregate usage (such as which pages are visited). It is designed to be
          privacy-friendly and does not use analytics cookies to build advertising profiles. Where consent is required,
          this measurement runs only after you accept non-essential tracking in the cookie banner.
        </p>
      </Section>

      <Section heading="Third-party requests">
        <p>
          Our typefaces are self-hosted — they are bundled at build time and served from StayKnit itself — so simply
          displaying the app makes no request to Google or any other font provider, and no cookie or IP address is
          shared with them. On the plan page, the app does load Paystack to process payments securely; Paystack may set
          its own cookies or receive your IP address as part of delivering that service.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>
          You can accept or decline non-essential tracking using the banner shown on your first visit, and you can change
          your choice at any time by clearing this site’s data in your browser. You can also block or delete cookies in
          your browser settings, though essential cookies are needed to stay signed in.
        </p>
      </Section>
    </LegalShell>
  )
}
