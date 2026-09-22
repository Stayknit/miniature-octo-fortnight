import type { Metadata } from 'next'
import { LegalShell, Section } from '@/components/legal/legal-shell'
import { LEGAL, SUBPROCESSORS, addressLine, registrationLines } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Privacy Policy — StayKnit',
  description: 'How StayKnit collects, uses, shares, and protects your personal data.',
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This Privacy Policy explains how {LEGAL.entity} (“StayKnit”, “we”) collects, uses, and shares personal
        information when you use StayKnit. We act as the responsible party (controller) for this data.
      </p>

      <Section heading="1. Information we collect">
        <p>
          <strong>Account data</strong> you give us: your name, email address, and password (stored only as a secure
          hash). <strong>Workspace data</strong> you create: properties, iCal feed URLs, bookings, owner records,
          statements, cost settings, and support messages. <strong>Payment data:</strong> plan purchases are handled by
          Paystack; we receive confirmation and status, not your full card number. <strong>Technical data:</strong> basic
          request and usage information (e.g. IP address, device/browser, aggregate analytics) collected to run and
          secure the Service.
        </p>
      </Section>

      <Section heading="2. How we use it">
        <p>
          To provide and operate the Service (syncing calendars, generating statements), to authenticate you and secure
          your account, to process payments, to respond to support requests, and to comply with legal obligations. We do
          not sell your personal information.
        </p>
      </Section>

      <Section heading="3. Legal bases">
        <p>
          We process data to perform our contract with you (providing the Service), to comply with legal obligations, and
          for our legitimate interests in securing and improving the Service, consistent with applicable data-protection
          law. Where required, non-essential processing (such as analytics) relies on your consent, which you can
          withdraw.
        </p>
      </Section>

      <Section heading="4. Who we share it with">
        <p>We share data only with the service providers needed to run StayKnit:</p>
        <ul className="mt-1 flex flex-col gap-1.5">
          {SUBPROCESSORS.map((s) => (
            <li key={s.name} className="flex gap-2">
              <span aria-hidden className="text-primary">
                •
              </span>
              <span>
                <strong className="text-foreground">{s.name}</strong> — {s.purpose}
              </span>
            </li>
          ))}
        </ul>
        <p>
          These providers process data on our behalf under contract, or as independent controllers for payments. We may
          also disclose data where required by law.
        </p>
      </Section>

      <Section heading="5. Retention">
        <p>
          We keep your data for as long as your account is active. Profiles left inactive for{' '}
          {LEGAL.inactivityRetentionMonths} months are deleted automatically, and you can delete your account at any time
          from Settings, which permanently erases your data. Some records may be retained longer where the law requires
          it (for example, payment records for tax purposes).
        </p>
      </Section>

      <Section heading="6. Your rights">
        <p>
          Subject to applicable law, you may access, correct, export, or delete your personal information, and object to
          or restrict certain processing. StayKnit provides self-service <strong>export</strong> and{' '}
          <strong>deletion</strong> in Settings. To exercise any other right, contact us at{' '}
          <a href={`mailto:${LEGAL.privacyEmail}`} className="text-primary hover:underline">
            {LEGAL.privacyEmail}
          </a>
          .
        </p>
      </Section>

      <Section heading="7. Cookies and tracking">
        <p>
          StayKnit uses essential cookies for authentication and a privacy-friendly analytics measurement to understand
          usage. See our{' '}
          <a href="/cookie-policy" className="text-primary hover:underline">
            Cookie Policy
          </a>{' '}
          for details and your choices.
        </p>
      </Section>

      <Section heading="8. Security">
        <p>
          Passwords are hashed, sessions use HttpOnly cookies, and data is scoped per account. No method of transmission
          or storage is completely secure, but we take reasonable measures to protect your information.
        </p>
      </Section>

      <Section heading="9. Contact">
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
          <a href={`mailto:${LEGAL.privacyEmail}`} className="text-primary hover:underline">
            {LEGAL.privacyEmail}
          </a>
        </p>
      </Section>
    </LegalShell>
  )
}
