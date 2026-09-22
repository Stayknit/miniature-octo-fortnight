import type { Metadata } from 'next'
import { LegalShell, Section } from '@/components/legal/legal-shell'
import { LEGAL, addressLine, registrationLines } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Terms of Service — StayKnit',
  description: 'The terms that govern your use of StayKnit’s calendar-sync service.',
}

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        These Terms of Service (the “Terms”) govern your access to and use of StayKnit (the “Service”), operated by{' '}
        {LEGAL.entity}
        {LEGAL.registration ? ` (registration ${LEGAL.registration})` : ''} (“StayKnit”, “we”, “us”). By creating an
        account or using the Service you agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <Section heading="1. What StayKnit does">
        <p>
          StayKnit mirrors calendar availability between your listing sites over iCal. It is a sync relay, not a booking
          channel. Only dates sync — guest messages, payments, and cancellations remain on the original channel. We never
          ask for or store your channel passwords; we read the public iCal export links you provide.
        </p>
      </Section>

      <Section heading="2. Minimum age and capacity to contract">
        <p>
          You must be at least 18 years old and legally capable of entering into a binding contract under South African
          law to create an account or use the Service. By registering, you confirm that you meet this requirement.
        </p>
      </Section>

      <Section heading="3. Your account">
        <p>
          You must provide accurate information and confirm your email address before your account becomes fully active.
          You are responsible for activity under your account and for keeping your credentials secure. Public sign-up
          creates a host account; owner logins are provisioned by their host and are read-only.
        </p>
      </Section>

      <Section heading="4. Licence to use the Service">
        <p>
          Subject to these Terms and your active subscription, StayKnit grants you a limited, non-exclusive,
          non-transferable licence to access and use the Service for your own property-management purposes. This licence
          does not permit you to resell, sublicense, copy, or reverse-engineer any part of the Service, or to use it to
          build a competing product.
        </p>
      </Section>

      <Section heading="5. Acceptable use">
        <p>
          You remain the host of record on every channel and must have the right to sync the listings you connect. You
          agree not to misuse the Service, interfere with its operation, attempt to access other users’ data, or use it
          for unlawful purposes.
        </p>
      </Section>

      <Section heading="6. Sync is best-effort">
        <p>
          Channels refresh iCal on their own schedules and may be delayed or unavailable. StayKnit is not liable for
          double-bookings, lost revenue, or other harm caused by a channel’s delay, outage, or incorrect data. Payout and
          statement figures are estimates calculated from synced data and your settings; reconcile them against channel
          payouts before paying owners.
        </p>
      </Section>

      <Section heading="7. Third-party listing sites">
        <p>
          The Service connects to third-party listing sites (such as Airbnb, Booking.com, and LekkerSlaap) via the
          calendar feeds you provide. These sites are operated independently of StayKnit, and we have no control over
          their content, availability, or accuracy. Your use of any listing site remains governed by that site’s own
          terms, and StayKnit is not responsible for any loss arising from your dealings with them.
        </p>
      </Section>

      <Section heading="8. Billing and cancellation">
        <p>
          StayKnit is a flat prepaid fee with no booking commission. Paid plans are billed once, upfront, for a fixed
          term. <strong>Auto-renewal is optional and off by default</strong>: unless you choose to enable it, a plan
          does not auto-renew, and when the term ends access reverts to the free trial unless you purchase another
          term. If you opt into auto-renewal — at checkout or later from your plan — you authorise StayKnit to store a
          secure payment token with Paystack and to charge the same term shortly before it ends, at the price then in
          effect, until you switch auto-renewal off. You can turn auto-renewal off at any time from your plan.
        </p>
        <p>
          <strong>Cancellation.</strong> You may cancel a paid plan at any time from your plan. A notice period applies
          — <strong>one month</strong> for monthly terms and <strong>two months</strong> for yearly terms — measured
          from the date you cancel. You keep full access through the notice period, after which your account returns to
          the free trial, and any auto-renewal is switched off so no further charge is made. Where you have prepaid
          beyond the notice period, we refund the unused balance on a pro-rata basis to your original payment method.
          Refunds are reviewed and released by StayKnit and typically reflect within 5–10 business days, depending on
          your bank. Please note that the payment processor&apos;s transaction fee is typically non-refundable, so a
          refund may be slightly less than the original amount paid. Amounts
          covering the applicable notice period are retained and are otherwise non-refundable except where required by
          law. The free trial requires no card, and nothing is charged until you confirm a paid plan. Payments are
          processed by Paystack; StayKnit never stores your full card details.
        </p>
      </Section>

      <Section heading="9. Your data">
        <p>
          Your data is scoped to your account and is never sold. You may export or delete your data at any time from
          Settings. Deleting your profile permanently erases your account and associated data and cannot be undone.
          Profiles left inactive for {LEGAL.inactivityRetentionMonths} months are deleted automatically. Our handling of
          personal data is described in the{' '}
          <a href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </Section>

      <Section heading="10. Disclaimers and limitation of liability">
        <p>
          The Service is provided “as is” without warranties of any kind, to the fullest extent permitted by law. To the
          maximum extent permitted by law, StayKnit’s total liability arising out of or relating to the Service is
          limited to the amount you paid us in the twelve months preceding the claim. Nothing in these Terms excludes
          liability that cannot lawfully be excluded.
        </p>
      </Section>

      <Section heading="11. Changes and termination">
        <p>
          We may update these Terms from time to time; material changes will be reflected by the “last updated” date
          above and, where appropriate, notified in-app. You may stop using the Service and delete your account at any
          time. We may suspend or terminate access for breach of these Terms.
        </p>
      </Section>

      <Section heading="12. Governing law">
        <p>
          These Terms are governed by the laws of {LEGAL.governingLaw}, and disputes are subject to {LEGAL.jurisdiction}.
        </p>
      </Section>

      <Section heading="13. Contact">
        <p>
          {LEGAL.entity}
          <br />
          {registrationLines().map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
          {addressLine()}
          <br />
          <a href={`mailto:${LEGAL.contactEmail}`} className="text-primary hover:underline">
            {LEGAL.contactEmail}
          </a>
        </p>
      </Section>
    </LegalShell>
  )
}
