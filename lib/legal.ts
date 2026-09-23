// -----------------------------------------------------------------------------
// StayKnit legal entity + policy configuration.
//
// ⚠️ ACTION REQUIRED before publishing: entity, `registration`/`taxNumber`, and
// `address` are now the owner-confirmed registered details. The one remaining
// task is to have a lawyer review the Terms of Service and Privacy Policy copy
// (see app/terms and app/privacy) — especially the liability, governing-law,
// and billing/cancellation clauses. These pages exist so the app is no longer
// missing legal documents entirely (report #11); they are a solid starting
// draft, not vetted legal advice.
// -----------------------------------------------------------------------------

export const LEGAL = {
  // The registered company that operates StayKnit.
  entity: "StayKnit (Pty) Ltd", // confirm exact registered legal name with counsel
  // Fill these with the real registered details. IMPORTANT: leave them as empty
  // strings until confirmed — never a "TODO" placeholder. The legal pages render
  // gracefully when a field is blank (see addressLine) instead of leaking a
  // template placeholder to real users (report #2, Round 7).
  registration: "2026/740258/07", // CIPC enterprise/registration number, confirmed by the business owner
  taxNumber: "9155051304", // SARS taxpayer registration number, confirmed by the business owner
  address: "Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa", // owner-confirmed registered address (street number withheld from public copy)
  contactEmail: "support@stayknit.org", // general + privacy/data-rights contact
  privacyEmail: "privacy@stayknit.org", // confirm or point to contactEmail
  // Governing law / dispute jurisdiction. StayKnit's product context (ZAR, 15%
  // VAT, Africa/Johannesburg) points to South Africa; confirm with counsel.
  governingLaw: "the Republic of South Africa",
  jurisdiction: "the courts of the Republic of South Africa",
  // Data-retention: matches the in-app 12-month inactivity purge.
  inactivityRetentionMonths: 12,
  lastUpdated: "23 September 2026", // keep in sync when copy changes
} as const

// Address as shown in the Contact sections. When the registered address hasn't
// been filled in yet, fall back to a neutral "available on request" line rather
// than rendering a placeholder — a raw "TODO:" must never reach a live user.
export function addressLine(): string {
  return LEGAL.address.trim()
    ? LEGAL.address
    : `Registered business address available on request — email ${LEGAL.contactEmail}.`
}

// Registration identifiers shown in the PUBLIC Contact sections (Terms, Privacy,
// customer receipts). Returns an empty array when the registration number hasn't
// been confirmed yet, so the legal pages stay clean rather than rendering blank
// or placeholder lines.
//
// The SARS taxpayer number (LEGAL.taxNumber) is deliberately NOT exposed here:
// StayKnit is not VAT-registered, so the taxpayer number adds no value to a
// public reader, and the owner asked to keep it out of public view. It remains
// the source of truth in LEGAL.taxNumber for internal / counsel documents (the
// downloadable legal pack and finance spreadsheets) that legitimately need it.
export function registrationLines(): string[] {
  const lines: string[] = []
  const reg = LEGAL.registration.trim()
  if (reg) lines.push(`Registration number: ${reg}`)
  return lines
}

// Third parties the app hands data to, disclosed in the Privacy Policy.
// NOTE: Google is intentionally NOT listed here. StayKnit loads its typefaces
// via Next.js `next/font/google`, which downloads the font files at BUILD time
// and self-hosts them from StayKnit's own domain — so a visitor's browser never
// requests anything from Google and no end-user IP is shared with Google. It is
// therefore not a sub-processor of personal data. (Legal review, 18 Sep 2026.)
export const SUBPROCESSORS: { name: string; purpose: string }[] = [
  { name: "Vercel Inc.", purpose: "Application hosting, analytics, and content delivery" },
  { name: "Neon Inc.", purpose: "Managed PostgreSQL database storage" },
  { name: "Paystack Payments Limited", purpose: "Payment processing for plan purchases" },
  { name: "Namecheap (Private Email)", purpose: "Transactional email delivery" },
]
