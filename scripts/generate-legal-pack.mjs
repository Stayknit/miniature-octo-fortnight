import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  ExternalHyperlink,
} from 'docx'
import { writeFileSync, mkdirSync } from 'node:fs'

// ---------- palette ----------
const NAVY = '1F2A44'
const SLATE = '55627A'
const ACCENT = '2E6F5E' // deep green
const NOTE_BG = 'FCF3E6' // warm parchment for counsel notes
const NOTE_BAR = 'C08A2B'
const TABLE_HEAD = '1F2A44'
const TABLE_ROW_SHADE = 'F3F5F8'
const LIGHT_LINE = 'D6DBE4'

// ---------- helpers ----------
const FONT = 'Calibri'
const HEAD_FONT = 'Cambria'

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 140 },
    children: [new TextRun({ text, font: HEAD_FONT, bold: true, size: 30, color: NAVY })],
    border: { bottom: { color: ACCENT, size: 12, style: BorderStyle.SINGLE, space: 6 } },
  })
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 90 },
    children: [new TextRun({ text, font: HEAD_FONT, bold: true, size: 24, color: ACCENT })],
  })
}
function h3(text) {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text, font: HEAD_FONT, bold: true, size: 21, color: NAVY })],
  })
}
function p(runs, opts = {}) {
  const children = Array.isArray(runs)
    ? runs
    : [new TextRun({ text: runs, font: FONT, size: 21, color: '2B2B2B' })]
  return new Paragraph({ spacing: { after: 120, line: 276 }, children, ...opts })
}
function run(text, o = {}) {
  return new TextRun({ text, font: FONT, size: 21, color: '2B2B2B', ...o })
}
function bullet(runs, level = 0) {
  const children = Array.isArray(runs) ? runs : [run(runs)]
  return new Paragraph({ bullet: { level }, spacing: { after: 70, line: 276 }, children })
}
function numbered(runs, ref) {
  const children = Array.isArray(runs) ? runs : [run(runs)]
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 70, line: 276 }, children })
}

// Counsel-note callout box
function note(children) {
  const kids = Array.isArray(children) ? children : [children]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
      left: { style: BorderStyle.SINGLE, size: 24, color: NOTE_BAR },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: NOTE_BG },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: kids,
          }),
        ],
      }),
    ],
  })
}
function noteP(label, text) {
  return p([
    new TextRun({ text: label + ' ', font: FONT, size: 20, bold: true, color: NOTE_BAR }),
    new TextRun({ text, font: FONT, size: 20, color: '4A3A1E', italics: true }),
  ], { spacing: { after: 0, line: 264 } })
}

// Table builder
function dataTable(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (htext) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: TABLE_HEAD },
          margins: { top: 80, bottom: 80, left: 110, right: 110 },
          children: [new Paragraph({ children: [new TextRun({ text: htext, font: FONT, bold: true, size: 19, color: 'FFFFFF' })] })],
        }),
    ),
  })
  const bodyRows = rows.map(
    (cells, i) =>
      new TableRow({
        children: cells.map(
          (c) =>
            new TableCell({
              shading: i % 2 ? { type: ShadingType.CLEAR, fill: TABLE_ROW_SHADE } : undefined,
              margins: { top: 70, bottom: 70, left: 110, right: 110 },
              children: [new Paragraph({ children: [new TextRun({ text: c, font: FONT, size: 19, color: '2B2B2B' })] })],
            }),
        ),
      }),
  )
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_LINE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LIGHT_LINE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [headerRow, ...bodyRows],
  })
}

function spacer(after = 120) {
  return new Paragraph({ spacing: { after }, children: [] })
}

// ---------- document body ----------
const children = []

// COVER
children.push(
  new Paragraph({ spacing: { before: 1600, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'StayKnit', font: HEAD_FONT, bold: true, size: 72, color: NAVY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: 'LEGAL & COMPLIANCE PACK', font: FONT, size: 28, color: ACCENT, characterSpacing: 60 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Prepared for legal counsel — pre-launch review', font: FONT, italics: true, size: 22, color: SLATE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: 'StayKnit (Pty) Ltd', font: FONT, size: 22, color: '2B2B2B', bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: 'Registration 2026/740258/07', font: FONT, size: 20, color: SLATE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: 'Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa', font: FONT, size: 20, color: SLATE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: 'www.stayknit.org  ·  support@stayknit.org  ·  privacy@stayknit.org', font: FONT, size: 20, color: SLATE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 }, children: [new TextRun({ text: 'Generated ' + new Date().toISOString().slice(0, 10), font: FONT, size: 18, color: SLATE })] }),
)

// Disclaimer box on cover
children.push(spacer(300))
children.push(
  note([
    noteP('DISCLAIMER.', 'This pack is a founder-prepared factual briefing to instruct an attorney. It is not legal advice and is not a set of finalised legal documents. Every statement describes how the product currently works, for counsel to verify and turn into enforceable, compliant instruments.'),
  ]),
)
children.push(new Paragraph({ children: [new PageBreak()] }))

// TABLE OF CONTENTS (manual)
children.push(h1('Contents'))
;[
  'Part 1 — Business Model & Product Overview',
  'Part 2 — Data Processing & POPIA Briefing',
  'Part 3 — Security & Safety Framework',
  'Part 4 — Instructions to Counsel',
  'Part 5 — Current In-App Legal Copy & Emailed Financial Documents (for review)',
  'Part 6 — Channel-Partner Data Processing & API Terms',
  'Part 7 — Additional Draft Clauses, Reviewed Against the App',
].forEach((t) =>
  children.push(p([new TextRun({ text: t, font: FONT, size: 22, color: NAVY })], { spacing: { after: 100 } })),
)
children.push(new Paragraph({ children: [new PageBreak()] }))

// ============ PART 1 ============
children.push(h1('Part 1 — Business Model & Product Overview'))
children.push(p([run('Purpose of this document: ', { bold: true }), run('to give legal counsel a plain, accurate picture of what StayKnit is, who uses it, how money flows, and where the legal risk sits — so that the Terms of Service, Privacy Policy, and any other agreements can be drafted to fit the actual business.')]))

children.push(h2('1. What StayKnit is'))
children.push(p('StayKnit is a software-as-a-service (SaaS) web application for short-stay / self-catering property managers in South Africa (and potentially neighbouring markets). It is a management tool, not a booking platform and not a payment intermediary between guests and property owners.'))
children.push(p('A typical user (“host”) is a small agency or individual who manages a handful of holiday rentals — cottages, guest houses, rooms — listed on third-party sites such as Airbnb, Booking.com, and LekkerSlaap. StayKnit helps them:'))
children.push(bullet('Sync calendars across all listing sites (via iCal feeds) so a booking on one site blocks the dates everywhere and prevents double-bookings.'))
children.push(bullet('See all bookings across channels in one place.'))
children.push(bullet('Produce owner statements — monthly financial breakdowns (gross income, commission, cleaning, VAT, net payout) for the property owners they manage.'))
children.push(bullet('Give property owners a read-only “owner portal” to see their own units’ bookings and statements.'))

children.push(h2('2. Who the users are (three roles)'))
children.push(dataTable(
  ['Role', 'Who they are', 'What they can do'],
  [
    ['Host', 'The paying customer — a property manager or agency.', 'Full access: properties, calendars, bookings, owner clients, statements, settings, billing.'],
    ['Owner', 'A client of the host — the actual property owner.', 'Read-only portal showing only their own units’ bookings and statements. Does not pay StayKnit.'],
    ['Guest', 'The end traveller who books a stay.', 'Not a user. Never logs in. Name and stay dates appear in the host’s booking records (imported from listing sites).'],
  ],
  [1700, 3400, 3900],
))
children.push(p([run('This three-party structure matters legally: ', {}), run('the host is our customer and pays us; the owner is the host’s customer; the guest is the owner’s/host’s customer.', { bold: true }), run(' StayKnit has a direct contractual relationship only with the host.')]))

children.push(h2('3. How StayKnit makes money (revenue model)'))
children.push(p('StayKnit charges the host a flat subscription fee by tier. Key characteristics:'))
children.push(bullet([run('No commission. ', { bold: true }), run('We never take a percentage of bookings or guest payments. The fee is a fixed software subscription, independent of how much the host earns.')]))
children.push(bullet([run('We never touch guest or owner money. ', { bold: true }), run('Guest payments are handled by the listing sites or directly between guest and host, outside StayKnit. Owner payouts are made by the host, outside StayKnit. StayKnit only records these figures for reporting.')]))
children.push(bullet([run('Tiers are defined by number of properties managed. ', { bold: true }), run('Higher tiers allow more listings.')]))
children.push(h3('Current pricing (South African rand, per month)'))
children.push(dataTable(
  ['Tier', 'Listings included', 'Monthly price (ZAR)'],
  [
    ['Free trial', '1', 'R0 (14 days; no card required, charged only on confirming a paid plan)'],
    ['Starter', 'up to 3', 'R199'],
    ['Host', 'up to 5', 'R299'],
    ['Professional', 'up to 15', 'R499'],
    ['Business', 'up to 30', 'R899'],
    ['Enterprise', '30+', 'Custom quote'],
  ],
  [2600, 3200, 3200],
))
children.push(p([run('All plans are billed in ZAR — the Rand is the single billing source of truth. Prices may be displayed in USD, EUR, GBP or NAD as an approximate convenience conversion for hosts outside South Africa, but the amount charged is always the ZAR figure; a foreign card is converted by the issuing bank at its own rate.', { italics: true, size: 19, color: SLATE })]))
children.push(h3('Billing terms'))
children.push(bullet('The host chooses a billing period: monthly, 6-month, or 1-year.'))
children.push(bullet('Longer terms are not discounted per month; the 6-month term takes 10% off the upfront total, and the 1-year term grants bonus free months (pay for 12, get 14 months of access).'))
children.push(bullet('Payment model is a prepaid, fixed-term subscription with optional, off-by-default auto-renewal. A host selects a plan and pays once, upfront, for the chosen term via Paystack; by default it does not renew and, when the term ends, access reverts to the free trial unless the host buys another term. A host may opt in to auto-renewal (at checkout or from the Plan screen), in which case StayKnit stores a reusable Paystack card authorisation and charges the same term shortly before it expires, at the then-current price, until the host switches it off.'))
children.push(bullet([run('Cancellation (unsubscribe) and turning off auto-renewal: ', { bold: true }), run('a host can cancel, or switch auto-renewal off, at any time from the Plan screen. A notice period applies — one month for monthly terms and two months for 6-month and yearly terms — measured from the cancel date; the host keeps full access through the notice period, then reverts to the free trial and any future auto-renewal charge stops. Where the host has prepaid beyond the notice period, StayKnit refunds the unused balance pro-rata to the original payment method (the Paystack transaction fee is typically non-refundable); amounts covering the notice period are retained and are otherwise non-refundable except where required by law. Cancelling also silences renewal reminders.')]))
children.push(bullet('Referrals: hosts can refer other hosts; both sides receive a free month when the invitee joins.'))
children.push(bullet('Founding-member rate: early customers may be locked to a preferential rate.'))
children.push(note([noteP('Counsel note.', 'Auto-renewal is optional and off by default; a host who does nothing is never auto-charged. When a host opts in, StayKnit stores a reusable Paystack card authorisation and charges the next term before expiry. Cancellation carries a notice period (one month monthly / two months for 6-month and yearly terms) and a pro-rata refund of any prepaid balance beyond that notice. Please confirm the prepaid fixed-term, expiry, self-service cancellation, notice-period, and pro-rata-refund mechanics — and the opt-in recurring-charge / card-on-file clause — against the Consumer Protection Act and ECTA (see Part 4, section C).')]))

children.push(h2('4. Payment processing'))
children.push(bullet([run('Payments are processed by Paystack, ', { bold: true }), run('a South African payment gateway, paying out to the company’s local FNB business bank account.')]))
children.push(bullet('StayKnit stores no card numbers. Card data is handled by the gateway; StayKnit stores only a payment reference and the resulting plan status — plus, for hosts who opt into auto-renewal, an opaque Paystack card-authorisation token (and customer code) that lets the gateway charge the same card again. That token is not a card number, cannot be used outside Paystack, and is cleared when the host turns auto-renewal off or cancels.'))
children.push(bullet('The gateway is a third-party processor with its own merchant agreement the company must accept.'))

children.push(h2('5. The company'))
children.push(dataTable(
  ['Field', 'Detail'],
  [
    ['Trading name', 'StayKnit'],
    ['Registered entity', 'StayKnit (Pty) Ltd (owner-confirmed; counsel to verify exact registered form)'],
    ['Registration number', '2026/740258/07 (CIPC — owner-confirmed)'],
    ['Taxpayer number', '9155051304 (SARS — owner-confirmed)'],
    ['Registered address', 'Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa'],
    ['Website', 'www.stayknit.org'],
    ['Contact', 'support@stayknit.org · privacy/data-rights: privacy@stayknit.org'],
    ['Market', 'South Africa (primary), with pricing support for other currencies'],
  ],
  [2600, 6400],
))
children.push(note([noteP('Counsel note.', 'These details are owner-confirmed and wired into the app’s legal pages. Please verify the registered legal form and that the CIPC registration number (2026/740258/07) and the distinct SARS taxpayer number (9155051304) are correct, and confirm VAT registration status. StayKnit offers hosts an optional VAT feature (15% SA default) on their management-fee lines in owner statements — this is the host’s VAT on their service to owners, separate from StayKnit’s own VAT position.')]))

children.push(h2('6. What we are asking counsel to produce'))
children.push(numbered('Terms of Service (host-facing subscription agreement).', 'p1list'))
children.push(numbered('Privacy Policy — POPIA-compliant (see Part 2).', 'p1list'))
children.push(numbered('Advice on consumer-protection (CPA / ECTA) obligations for the prepaid fixed-term subscription, its optional opt-in auto-renewal, and the cancellation mechanics. Auto-renewal is off by default; a host who does nothing is never auto-charged. When a host opts in, StayKnit stores a reusable Paystack card authorisation and charges the next term before expiry — please review pre-charge notice, price-change disclosure, ease of cancellation, and stored-credential consent.', 'p1list'))
children.push(numbered('Advice on the host↔owner↔guest data relationship and whether StayKnit needs a data-processing/operator agreement with hosts under POPIA.', 'p1list'))
children.push(new Paragraph({ children: [new PageBreak()] }))

// ============ PART 2 ============
children.push(h1('Part 2 — Data Processing & POPIA Briefing'))
children.push(p([run('Purpose: ', { bold: true }), run('to give counsel a precise inventory of the personal information StayKnit collects, why, where it lives, and who else touches it — the raw material for a POPIA-compliant Privacy Policy and for deciding what data agreements are needed.')]))

children.push(h2('1. The three data subjects'))
children.push(p('StayKnit handles personal information about three different kinds of people, and they are not all our customers:'))
children.push(numbered([run('Hosts', { bold: true }), run(' — our direct customers. They give us their data by signing up.')], 'p2list'))
  children.push(numbered([run('Owners', { bold: true }), run(' — the host’s clients. Their details are entered by the host, and they may be invited to a read-only portal.')], 'p2list'))
children.push(numbered([run('Guests', { bold: true }), run(' — travellers. Their names and stay dates are imported from third-party listing sites (via calendar feeds) or entered by the host. Guests have no relationship with StayKnit and do not know StayKnit exists.')], 'p2list'))
children.push(note([noteP('Key POPIA question for counsel.', 'For host account data, StayKnit is plainly the responsible party. But for owner and guest data — which the host puts into the system to run their business — is StayKnit an operator (processor) acting on the host’s behalf, with the host as responsible party? This determines whether we need an operator agreement baked into the Terms, and who owes the data-subject notifications.')]))

children.push(h2('2. Personal information inventory'))
children.push(h3('2a. Host (account holder) data'))
children.push(dataTable(
  ['Data', 'Purpose', 'Source'],
  [
    ['Name', 'Account identity, statements', 'Host at signup'],
    ['Email address', 'Login, account comms, verification', 'Host at signup'],
    ['Password (hashed)', 'Authentication', 'Host; stored hashed (never plain text)'],
    ['Security-question answers (hashed)', 'Identity check for password reset', 'Host; stored hashed'],
    ['Session data — IP, user-agent', 'Session management, security', 'Captured automatically on login'],
    ['Last-active timestamp', 'Inactivity cleanup (see retention)', 'Automatic'],
    ['Business name, email, phone', 'Printed on owner statements', 'Host in settings'],
    ['Subscription & payment reference', 'Billing, plan status', 'Payment gateway + host'],
  ],
  [3200, 3400, 2400],
))
children.push(h3('2b. Owner (host’s client) data'))
children.push(dataTable(
  ['Data', 'Purpose', 'Source'],
  [
    ['Name', 'Identify the owner on statements & portal', 'Entered by host'],
    ['Email address', 'Owner-portal invitations', 'Entered by host'],
    ['Units owned; financial figures (gross, commission, cleaning, net)', 'Generate owner statements', 'Entered/derived by host'],
  ],
  [3200, 3400, 2400],
))
children.push(h3('2c. Guest data'))
children.push(dataTable(
  ['Data', 'Purpose', 'Source'],
  [
    ['Guest name', 'Show who is booked in a reservation', 'Imported from listing-site iCal feeds, or entered by host'],
    ['Stay dates, channel, amount, paid status', 'Calendar sync, booking records, statements', 'Imported / entered by host'],
  ],
  [3200, 3400, 2400],
))
children.push(note([noteP('Note.', 'StayKnit does not collect guest contact details, ID numbers, or payment details. Guest data is limited to what a calendar feed carries (typically a name and dates). Counsel should confirm whether even this limited guest data triggers notification duties, given guests are unaware of StayKnit.')]))

children.push(h3('2d. Purpose limitation — internal support use only'))
children.push(p('All personal information above is used only internally, to operate the service and provide account support to the host (authentication, billing, generating statements, responding to help requests, and security). StayKnit does not sell personal information, and does not share or use it for marketing, advertising, or profiling. This purpose limitation is surfaced to hosts at signup (“Your personal details are used internally for account support only — never sold or shared for marketing”) and should be reflected in the Privacy Policy so the stated purpose matches actual practice.'))

children.push(h2('3. Special personal information / children'))
children.push(bullet('StayKnit does not intentionally collect any special personal information under POPIA (race, health, religion, biometrics, etc.).'))
children.push(bullet('StayKnit is a business tool not directed at children and does not knowingly collect children’s data.'))
children.push(bullet('Counsel to confirm the Privacy Policy states both clearly.'))

children.push(h2('4. Where the data lives (hosting & data flows)'))
children.push(dataTable(
  ['Component', 'Provider', 'Location', 'Notes'],
  [
    ['Application hosting', 'Vercel', 'Global edge / US regions', 'Serves the web app.'],
    ['Database (all app + account data)', 'Neon (managed PostgreSQL)', 'Cloud region (to confirm)', 'Primary store of all personal information.'],
    ['Authentication', 'Better Auth (in-app, data in Neon)', 'With the database', 'Passwords hashed; sessions stored.'],
    ['Payments', 'Paystack (planned)', 'South Africa', 'Card data handled by gateway; we store only a reference.'],
    ['Outbound email', 'Namecheap Private Email (SMTP)', 'SPF, DKIM & DMARC published (verified live 20 Sep 2026)', 'Verification / reset / notifications from stayknit.org.'],
    ['Calendar feeds', 'Listing sites (Airbnb, Booking.com, LekkerSlaap…)', 'External', 'Inbound iCal — we read their feeds; we do not send them data.'],
  ],
  [2300, 2600, 2100, 2000],
))
children.push(note([noteP('Cross-border transfer flag for counsel.', 'The database and app hosting are likely outside South Africa. POPIA section 72 restricts transferring personal information outside the Republic. Counsel must advise whether our hosting arrangement satisfies section 72 (e.g. the recipient is subject to comparable protection / binding contractual terms) and how to word this in the Privacy Policy.')]))

children.push(h2('5. Data retention & deletion (already built)'))
children.push(bullet([run('Automatic inactivity purge: ', { bold: true }), run('a host profile untouched for 12 months is automatically deleted. The last-active timestamp refreshes on every workspace load.')]))
children.push(bullet([run('Cascade deletion: ', { bold: true }), run('sessions and linked accounts are deleted automatically when a user is deleted (foreign-key cascade).')]))
children.push(bullet([run('Owner-portal invites ', { bold: true }), run('carry explicit revokedAt / acceptedAt timestamps and are scoped to named units only.')]))
children.push(note([noteP('Counsel to advise.', 'Does 12-month auto-purge, plus an on-request deletion route, satisfy POPIA’s retention and data-subject-request obligations? Do we need a documented data-subject request process (access, correction, deletion) in the Privacy Policy?')]))

children.push(h2('6. Security measures (already built)'))
children.push(bullet('Passwords and security-question answers are hashed, never stored in plain text.'))
children.push(bullet('Email verification is required before an account is active.'))
children.push(bullet('Optional two-factor authentication (TOTP authenticator app) is available to every account and recommended by StayKnit; when a user enables it, it is enforced at sign-in.'))
children.push(bullet('Per-user data scoping: every record is tied to a userId; queries are filtered so one host can never read another’s data. Owner portals are cryptographically scoped by token to named units only.'))
children.push(bullet('Enforced HTTPS with HSTS, a strict Content-Security-Policy, and standard security response headers on the live domain (independently verified).'))
children.push(note([noteP('Counsel note.', 'These are provided so the Privacy Policy’s “how we protect your information” section is accurate and not overstated. Please phrase them as reasonable measures, not guarantees.')]))

children.push(h2('7. Third-party processors (sub-operators) to disclose'))
children.push(p('Vercel (hosting), Neon (database), Paystack (payments), the SMTP/email provider, and the listing sites whose calendar feeds we read. Counsel to confirm which must be named in the Privacy Policy and whether operator agreements with each are needed.'))
children.push(new Paragraph({ children: [new PageBreak()] }))

// ============ PART 3 — SECURITY & SAFETY FRAMEWORK ============
children.push(h1('Part 3 — Security & Safety Framework'))
children.push(p([run('Purpose: ', { bold: true }), run('to give counsel (and, where appropriate, prospective customers) an accurate, non-overstated description of the technical and organisational measures StayKnit uses to protect personal information and keep the Service safe to use. It is the factual basis for the “how we protect your information” section of the Privacy Policy, for any security representations in the Terms, and for POPIA section 19 (reasonable technical and organisational measures).')]))
children.push(note([noteP('Basis.', 'Grounded in the actual application, database schema, and independently verified live-domain configuration. Measures are already implemented unless marked planned or to formalise. Counsel should phrase these as reasonable measures, not guarantees.')]))

children.push(h2('1. Scope and approach'))
children.push(p('StayKnit is a single web application with a managed PostgreSQL database — no separate mobile app, no self-hosted server estate, and no handling of card data. The security model rests on four pillars: strong authentication, strict per-tenant data isolation, hardened transport/platform configuration, and data minimisation with automatic deletion. Known gaps still to formalise are listed in section 9.'))

children.push(h2('2. Identity & access management'))
children.push(bullet([run('Email verification is mandatory. ', { bold: true }), run('A new host account is not fully active until the email address is confirmed, preventing account creation against other people’s addresses.')]))
children.push(bullet([run('Passwords are hashed, never stored in plaintext. ', { bold: true }), run('Authentication is handled by Better Auth; the plaintext password is never persisted or logged.')]))
children.push(bullet([run('Security-question answers are also hashed. ', { bold: true }), run('Identity-verification answers used for password recovery are stored hashed, not in clear text.')]))
children.push(bullet([run('Two-factor authentication (TOTP). ', { bold: true }), run('Optional for all accounts (hosts and owners) but recommended by StayKnit, and offered from Settings. When a user enables it, it is enforced at sign-in — a correct password alone is not enough. Single-use backup codes are issued for device loss, and security questions provide a fallback recovery path.')]))
children.push(bullet([run('Sessions use HttpOnly cookies ', { bold: true }), run('with secure attributes, and are tracked with IP and user-agent for anomaly visibility, reducing exposure to script-based theft and CSRF.')]))

children.push(h2('3. Tenant isolation & authorisation'))
children.push(bullet([run('Per-user scoping on every record. ', { bold: true }), run('Every row is tied to a userId and queries are filtered by the authenticated user, so one host can never read or modify another host’s data.')]))
children.push(bullet([run('Owner portals are token-scoped and read-only. ', { bold: true }), run('An owner sees only the specific units assigned to them, via a scoped token, and cannot write to any record.')]))
children.push(bullet([run('Invitations are revocable and time-stamped. ', { bold: true }), run('Each owner-portal invite carries explicit acceptedAt / revokedAt timestamps, so access can be withdrawn and the history is auditable.')]))

children.push(h2('4. Application & transport security'))
children.push(bullet([run('HTTPS enforced with HSTS ', { bold: true }), run('on the live domain, so browsers refuse to downgrade to plaintext.')]))
children.push(bullet([run('Strict Content-Security-Policy ', { bold: true }), run('and standard security response headers (e.g. X-Content-Type-Options: nosniff, Referrer-Policy, framing restrictions) are set on the live domain.')]))
children.push(bullet([run('Independently verified. ', { bold: true }), run('The transport and header configuration has been checked against the live domain, not merely asserted.')]))

children.push(h2('5. Payment security'))
children.push(bullet([run('StayKnit stores no card numbers. ', { bold: true }), run('Card entry and processing are handled entirely by Paystack, a PCI-DSS-compliant South African gateway. StayKnit persists only a payment/subscription reference and the plan status.')]))
children.push(bullet([run('No card data transits StayKnit’s own servers, ', { bold: true }), run('which removes StayKnit from most PCI-DSS scope. Compliance to confirm the correct SAQ level with the gateway.')]))

children.push(h2('6. Data protection, retention & deletion'))
children.push(bullet([run('Data minimisation. ', { bold: true }), run('StayKnit collects little: host account details, host-entered owner records, and guest name + stay dates only (no guest contact details, ID numbers, or payment data).')]))
children.push(bullet([run('Automatic inactivity purge. ', { bold: true }), run('A host profile untouched for 12 months is deleted automatically; the last-active timestamp refreshes on every workspace load.')]))
children.push(bullet([run('Cascade deletion. ', { bold: true }), run('When a user is deleted, linked sessions and accounts are removed automatically via foreign-key cascade.')]))
children.push(bullet([run('Self-service export and deletion. ', { bold: true }), run('Hosts can export or permanently delete their data from Settings at any time; deletion is irreversible.')]))

children.push(h2('7. Infrastructure & sub-processors'))
children.push(dataTable(
  ['Layer', 'Provider', 'Security relevance'],
  [
    ['Application hosting / CDN', 'Vercel', 'Managed platform; TLS termination, edge delivery.'],
    ['Database', 'Neon (managed PostgreSQL)', 'Primary store; backups and encryption at rest are provider-managed (posture to confirm).'],
    ['Authentication', 'Better Auth (in-app, data in Neon)', 'Hashing, session management.'],
    ['Payments', 'Paystack', 'PCI-DSS gateway; card data never reaches StayKnit.'],
    ['Outbound email', 'Namecheap Private Email (SMTP)', 'Verification / reset / notification delivery from stayknit.org.'],
  ],
  [2600, 3000, 3400],
))
children.push(note([noteP('Counsel note.', 'Each of these is a candidate sub-operator under POPIA. See Part 2 for the operator-agreement question.')]))

children.push(h2('8. Availability & operational safety'))
children.push(bullet([run('Calendar sync is best-effort by design. ', { bold: true }), run('StayKnit reads third-party iCal feeds on their publishers’ schedules; it cannot guarantee real-time accuracy and is not the system of record for bookings. Hosts are told to reconcile figures against channel payouts before paying owners — a safety-by-disclosure measure reflected in the Terms.')]))
children.push(bullet([run('No handling of guest or owner money, ', { bold: true }), run('which removes an entire class of financial-fraud and settlement risk from the product.')]))

children.push(h2('9. Gaps still to formalise'))
children.push(p('Known items not yet fully documented, which we intend to close before or shortly after launch:'))
children.push(bullet('A written incident & data-breach response procedure, including POPIA section 22 notification to the Information Regulator and affected data subjects, with defined timelines and an owner.'))
children.push(bullet('A confirmed backup / disaster-recovery statement from Neon (retention window, point-in-time recovery).'))
children.push(bullet('A documented data-subject-request workflow (access, correction, deletion) beyond the existing self-service tools.'))
children.push(bullet('Confirmation of encryption-at-rest specifics and cross-border data-location posture (see the POPIA section 72 flag in Part 2).'))
children.push(bullet('A lightweight access-review / secrets-rotation practice for the small team.'))
children.push(note([noteP('Counsel note.', 'Please advise which of the section 9 items are legally required before launch versus advisable, and whether any security representations in this Part should be softened or qualified in the customer-facing Terms and Privacy Policy.')]))
children.push(new Paragraph({ children: [new PageBreak()] }))

// ============ PART 4 ============
children.push(h1('Part 4 — Instructions to Counsel'))
children.push(p([run('From: ', { bold: true }), run('StayKnit (Pty) Ltd — reg. 2026/740258/07 — Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa')]))
children.push(p([run('Re: ', { bold: true }), run('Legal documents and advice required before public launch of a South African SaaS product.')]))
children.push(p('This part lists exactly what we need from you. Background is in Parts 1 and 2 — please read those first; they describe the product and the data accurately.'))

children.push(h2('A. Documents we need drafted (or reviewed)'))
children.push(p('We have draft in-app copy for the items below (see Part 4) — please review and make them enforceable and compliant rather than starting from scratch, unless you advise otherwise.'))
children.push(numbered([run('Terms of Service / Subscription Agreement — ', { bold: true }), run('the contract between StayKnit and the host. Must cover the subscription model, tiers and ZAR pricing; billing periods (monthly / 6-month / 1-year), the “bonus free months” and “10% off upfront” mechanics. Plans are prepaid with optional, off-by-default auto-renewal — by default they expire at term end and the host re-purchases manually, but a host may opt in, storing a reusable Paystack card authorisation that charges the next term before expiry until switched off (please draft/review the recurring-charge and card-on-file clause accordingly); self-service cancellation and auto-renewal-off, with a notice period (one month for monthly terms, two months for 6-month and yearly terms) after which the account reverts to the free trial, and a pro-rata refund of any prepaid balance beyond that notice period; free-trial terms (14 days; no card captured at signup — the host is charged only when they confirm a paid plan); referral credits and any “founding rate” lock-in; acceptable use, limitation of liability, disclaimers (especially that StayKnit is a management tool and is not responsible for double-bookings, lost bookings, or calendar-sync failures originating from third-party listing sites), and termination/suspension rights; governing law: South Africa.')], 'p3list'))
children.push(numbered([run('Privacy Policy — ', { bold: true }), run('POPIA-compliant. See section B.')], 'p3list'))
children.push(numbered([run('Operator / data-processing terms — ', { bold: true }), run('advise whether these should be a schedule to the Terms (see B1).')], 'p3list'))
children.push(numbered([run('Cookie / tracking notice — ', { bold: true }), run('advise whether required; the app uses session cookies and may add analytics.')], 'p3list'))

children.push(h2('B. POPIA advice we specifically need'))
children.push(numbered([run('Responsible party vs operator. ', { bold: true }), run('For owner and guest data that hosts enter to run their own businesses, are we an operator acting for the host (host = responsible party)? If so, we need operator obligations reflected in the Terms.')], 'p3blist'))
children.push(numbered([run('Guest data with no relationship. ', { bold: true }), run('Guest names/dates are imported from listing sites; guests don’t know StayKnit exists. What are our notification/lawful-processing duties, and can they be discharged via the host?')], 'p3blist'))
children.push(numbered([run('Cross-border transfer (s72). ', { bold: true }), run('Our hosting (Vercel) and database (Neon) are likely outside South Africa. Advise whether this is permitted and how to disclose/paper it.')], 'p3blist'))
children.push(numbered([run('Data-subject requests. ', { bold: true }), run('Confirm our required process for access, correction, and deletion requests, and whether our existing 12-month auto-purge plus on-request deletion is sufficient.')], 'p3blist'))
children.push(numbered([run('Information Officer. ', { bold: true }), run('Do we need to register an Information Officer with the Information Regulator, and what must we put in place (PAIA manual)?')], 'p3blist'))
children.push(numbered([run('Breach notification. ', { bold: true }), run('Confirm our obligations and the wording needed in the policy and internal process.')], 'p3blist'))

children.push(h2('C. Consumer-protection / e-commerce advice (CPA & ECTA)'))
children.push(numbered([run('Prepaid fixed-term subscriptions + optional auto-renewal: ', { bold: true }), run('confirm our prepaid term, expiry, self-service cancellation, notice-period (one month monthly / two months for 6-month and yearly terms), and pro-rata-refund mechanics comply with the Consumer Protection Act (rules on fixed-term agreements and cooling-off). Auto-renewal is off by default — a host who does nothing is never auto-charged. When a host opts in, we store a reusable Paystack card authorisation and charge the next term before expiry: please advise on CPA/ECTA requirements for that recurring charge — pre-charge notice, price-change disclosure, ease of opting out, and consent/record-keeping for stored payment credentials.')], 'p3clist'))
children.push(numbered([run('ECTA: ', { bold: true }), run('confirm the online-contracting flow (click-to-accept terms gate), required pre-contract disclosures, and the consumer’s statutory cooling-off rights for electronic transactions.')], 'p3clist'))
children.push(numbered([run('Refunds: ', { bold: true }), run('advise a compliant refund position for mid-term cancellations, given we bill upfront for terms.')], 'p3clist'))

children.push(h2('D. Company / tax items to confirm'))
children.push(bullet('Correct legal entity name, CIPC registration number, registered address.'))
children.push(bullet('VAT registration status of StayKnit itself. (Separately, the product offers hosts an optional 15% VAT feature on their management-fee lines to their owners — this is the host’s VAT, not ours, but flag if it creates any disclosure duty for us.)'))

children.push(h2('E. Practical questions'))
children.push(numbered('Given we operate in ZAR and target SA, do you recommend any restriction on serving hosts outside South Africa (we support other currencies) — e.g. GDPR exposure if an EU host signs up?', 'p3elist'))
children.push(numbered('Is there any licensing/regulatory issue with the product recording financial figures and producing owner statements (we do not hold or move money)? We want to be sure we are not inadvertently a payment intermediary, estate agent, or financial-services provider.', 'p3elist'))
children.push(numbered('Any disclaimers you recommend around the VAT/commission/statement calculations the software performs, to avoid liability if a host relies on them for their own tax filings.', 'p3elist'))

children.push(h2('F. What we are NOT asking for'))
children.push(bullet('We do not process guest or owner payments and do not want documents that imply we do.'))
children.push(bullet('We do not need employment or fundraising documents at this stage.'))

children.push(note([noteP('Drafting note.', 'The in-app copy names Paystack as the payment processor. Please treat Paystack as the disclosed sub-operator (processor) in the Privacy Policy.')]))
children.push(p('Please advise on your fee and turnaround. Our launch is gated on these items, so we would appreciate an early indication of any showstoppers.'))
children.push(new Paragraph({ children: [new PageBreak()] }))

// ============ PART 5 ============
children.push(h1('Part 5 — Current In-App Legal Copy & Emailed Financial Documents (for review)'))
children.push(p([run('Purpose: ', { bold: true }), run('this is the exact text currently published in the app at /terms, /privacy, and /cookie-policy. It is a founder-written starting draft, not vetted legal advice. Please review it, correct it, and make it enforceable and POPIA/CPA/ECTA-compliant.')]))
children.push(note([noteP('Payment processor.', 'Payments are processed by Paystack. Please treat Paystack as the disclosed sub-operator (processor) in the Privacy Policy.')]))

children.push(h2('Terms of Service (current copy at /terms)'))
const terms = [
  ['', 'These Terms of Service (the “Terms”) govern your access to and use of StayKnit (the “Service”), operated by StayKnit (Pty) Ltd (registration 2026/740258/07) (“StayKnit”, “we”, “us”). By creating an account or using the Service you agree to these Terms. If you do not agree, do not use the Service.'],
  ['1. What StayKnit does. ', 'StayKnit mirrors calendar availability between your listing sites over iCal. It is a sync relay, not a booking channel. Only dates sync — guest messages, payments, and cancellations remain on the original channel. We never ask for or store your channel passwords; we read the public iCal export links you provide.'],
  ['2. Minimum age and capacity to contract. ', 'You must be at least 18 years old and legally capable of entering into a binding contract under South African law to create an account or use the Service. By registering, you confirm that you meet this requirement.'],
  ['3. Your account. ', 'You must provide accurate information and confirm your email address before your account becomes fully active. You are responsible for activity under your account and for keeping your credentials secure. Public sign-up creates a host account; owner logins are provisioned by their host and are read-only.'],
  ['4. Licence to use the Service. ', 'Subject to these Terms and your active subscription, StayKnit grants you a limited, non-exclusive, non-transferable licence to access and use the Service for your own property-management purposes. This licence does not permit you to resell, sublicense, copy, or reverse-engineer any part of the Service, or to use it to build a competing product.'],
  ['5. Acceptable use. ', 'You remain the host of record on every channel and must have the right to sync the listings you connect. You agree not to misuse the Service, interfere with its operation, attempt to access other users’ data, or use it for unlawful purposes.'],
  ['6. Sync is best-effort. ', 'Channels refresh iCal on their own schedules and may be delayed or unavailable. StayKnit is not liable for double-bookings, lost revenue, or other harm caused by a channel’s delay, outage, or incorrect data. Payout and statement figures are estimates calculated from synced data and your settings; reconcile them against channel payouts before paying owners.'],
  ['7. Third-party listing sites. ', 'The Service connects to third-party listing sites (such as Airbnb, Booking.com, and LekkerSlaap) via the calendar feeds you provide. These sites are operated independently of StayKnit, and we have no control over their content, availability, or accuracy. Your use of any listing site remains governed by that site’s own terms, and StayKnit is not responsible for any loss arising from your dealings with them.'],
  ['8. Billing and cancellation. ', 'StayKnit is a flat prepaid fee with no booking commission. Paid plans are billed once, upfront, for a fixed term. Auto-renewal is optional and off by default: unless you choose to enable it, a plan does not auto-renew, and when the term ends access reverts to the free trial unless you purchase another term. If you opt into auto-renewal — at checkout or later from your plan — you authorise StayKnit to store a secure payment token with Paystack and to charge the same term shortly before it ends, at the price then in effect, until you switch auto-renewal off. You can turn auto-renewal off at any time from your plan.'],
  ['Cancellation. ', 'You may cancel a paid plan at any time from your plan. A notice period applies — one month for monthly terms and two months for yearly terms — measured from the date you cancel. You keep full access through the notice period, after which your account returns to the free trial, and any auto-renewal is switched off so no further charge is made. Where you have prepaid beyond the notice period, we refund the unused balance on a pro-rata basis to your original payment method. Refunds are reviewed and released by StayKnit and typically reflect within 5–10 business days, depending on your bank. Please note that the payment processor’s transaction fee is typically non-refundable, so a refund may be slightly less than the original amount paid. Amounts covering the applicable notice period are retained and are otherwise non-refundable except where required by law. The free trial requires no card, and nothing is charged until you confirm a paid plan. Payments are processed by Paystack; StayKnit never stores your full card details.'],
]
terms.forEach(([label, text]) =>
  children.push(p(label ? [run(label, { bold: true }), run(text)] : [run(text)])),
)
  children.push(note([noteP('Counsel note on §8 Billing & cancellation (updated 22 Sep 2026).', 'Two mechanics to review. (a) Optional auto-renewal: off by default (a host who does nothing is never auto-charged and reverts to the free trial); a host may opt in (at checkout or later), storing a reusable Paystack card authorisation that charges the same term shortly before expiry at the then-current price until switched off (a daily renewals cron, not Paystack Subscriptions). (b) Cancellation: now carries a notice period — one month monthly / two months for 6-month and yearly terms, measured from the cancel date — after which access reverts to the free trial, plus a pro-rata refund of any prepaid balance beyond the notice period (Paystack’s transaction fee is typically non-refundable). Please review both the recurring-charge / card-on-file clause and the notice-period + pro-rata-refund mechanics against the Consumer Protection Act and ECTA — pre-charge notice, price-change disclosure, ease of cancellation, fixed-term/cooling-off rules, and stored-credential consent/record-keeping. Drafting flag: the live billing clause names only monthly and yearly notice periods; the app also applies the two-month notice to the 6-month term, so the in-app wording should name it. This supersedes the previous “no refund / keeps paid time” position.')]))
const terms2 = [
  ['9. Your data. ', 'Your data is scoped to your account and is never sold. You may export or delete your data at any time from Settings. Deleting your profile permanently erases your account and associated data and cannot be undone. Profiles left inactive for 12 months are deleted automatically. Our handling of personal data is described in the Privacy Policy.'],
  ['10. Disclaimers and limitation of liability. ', 'The Service is provided “as is” without warranties of any kind, to the fullest extent permitted by law. To the maximum extent permitted by law, StayKnit’s total liability arising out of or relating to the Service is limited to the amount you paid us in the twelve months preceding the claim. Nothing in these Terms excludes liability that cannot lawfully be excluded.'],
  ['11. Changes and termination. ', 'We may update these Terms from time to time; material changes will be reflected by the “last updated” date above and, where appropriate, notified in-app. You may stop using the Service and delete your account at any time. We may suspend or terminate access for breach of these Terms.'],
  ['12. Governing law. ', 'These Terms are governed by the laws of the Republic of South Africa, and disputes are subject to the courts of the Republic of South Africa.'],
    ['13. Contact. ', 'StayKnit (Pty) Ltd · Registration number: 2026/740258/07 · Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa · support@stayknit.org'],
]
terms2.forEach(([label, text]) => children.push(p([run(label, { bold: true }), run(text)])))

children.push(h2('Privacy Policy (current copy at /privacy)'))
const priv = [
  ['', 'This Privacy Policy explains how StayKnit (Pty) Ltd (“StayKnit”, “we”) collects, uses, and shares personal information when you use StayKnit. We act as the responsible party (controller) for this data.'],
  ['1. Information we collect. ', 'Account data you give us: your name, email address, and password (stored only as a secure hash). Workspace data you create: properties, iCal feed URLs, bookings, owner records, statements, cost settings, and support messages. Payment data: plan purchases are handled by Paystack; we receive confirmation and status, not your full card number. Technical data: basic request and usage information (e.g. IP address, device/browser, aggregate analytics) collected to run and secure the Service.'],
  ['2. How we use it. ', 'To provide and operate the Service (syncing calendars, generating statements), to authenticate you and secure your account, to process payments, to respond to support requests, and to comply with legal obligations. We do not sell your personal information.'],
  ['3. Legal bases. ', 'We process data to perform our contract with you, to comply with legal obligations, and for our legitimate interests in securing and improving the Service, consistent with applicable data-protection law. Where required, non-essential processing (such as analytics) relies on your consent, which you can withdraw.'],
  ['4. Who we share it with. ', 'We share data only with the service providers needed to run StayKnit: Vercel Inc. (hosting, analytics, CDN); Neon Inc. (managed PostgreSQL database); Paystack Payments Limited (payment processing); Namecheap (Private Email) (transactional email). These providers process data on our behalf under contract, or as independent controllers for payments. We may also disclose data where required by law.'],
  ['5. Retention. ', 'We keep your data for as long as your account is active. Profiles left inactive for 12 months are deleted automatically, and you can delete your account at any time from Settings. Some records may be retained longer where the law requires it (for example, payment records for tax purposes).'],
  ['6. Your rights. ', 'Subject to applicable law, you may access, correct, export, or delete your personal information, and object to or restrict certain processing. StayKnit provides self-service export and deletion in Settings. To exercise any other right, contact us at privacy@stayknit.org.'],
  ['7. Cookies and tracking. ', 'StayKnit uses essential cookies for authentication and a privacy-friendly analytics measurement to understand usage. See our Cookie Policy for details and your choices.'],
  ['8. Security. ', 'Passwords are hashed, sessions use HttpOnly cookies, and data is scoped per account. No method of transmission or storage is completely secure, but we take reasonable measures to protect your information.'],
    ['9. Contact. ', 'StayKnit (Pty) Ltd · Registration number: 2026/740258/07 · Pai Nosso Close, Paternoster, Western Cape, 7183, South Africa · privacy@stayknit.org'],
]
priv.forEach(([label, text]) => children.push(p(label ? [run(label, { bold: true }), run(text)] : [run(text)])))
children.push(note([noteP('Counsel note on the sub-processor list.', 'Please confirm the correct legal name of each provider (e.g. “Paystack Payments Limited”, and “Namecheap (Private Email)” for the current SMTP email provider) and whether operator agreements are required.')]))

children.push(h2('Cookie Policy (current copy at /cookie-policy)'))
const cookie = [
  ['', 'This policy explains the cookies and similar technologies StayKnit uses. A cookie is a small file stored on your device; we use them sparingly and only for the purposes below.'],
  ['Essential cookies. ', 'These are required for the Service to work and cannot be switched off. They keep you signed in (a secure, HttpOnly session cookie) and protect against cross-site request forgery. Because they are strictly necessary, they do not require consent.'],
  ['Analytics. ', 'We use Vercel Analytics to understand aggregate usage (such as which pages are visited). It is designed to be privacy-friendly and does not use analytics cookies to build advertising profiles. Where consent is required, this measurement runs only after you accept non-essential tracking in the cookie banner.'],
  ['Third-party requests. ', 'Our typefaces are self-hosted — bundled at build time and served from StayKnit itself — so simply displaying the app makes no request to Google or any other font provider, and no cookie or IP address is shared with them. On the plan page, the app does load Paystack to process payments securely; Paystack may set its own cookies or receive your IP address as part of delivering that service.'],
  ['Your choices. ', 'You can accept or decline non-essential tracking using the banner shown on your first visit, and you can change your choice at any time by clearing this site’s data in your browser. You can also block or delete cookies in your browser settings, though essential cookies are needed to stay signed in.'],
]
cookie.forEach(([label, text]) => children.push(p(label ? [run(label, { bold: true }), run(text)] : [run(text)])))

// ---- Customer-facing financial documents (emailed to hosts) ----
children.push(h2('Financial documents emailed to hosts (for review)'))
children.push(p([run('Purpose: ', { bold: true }), run('StayKnit emails three financial documents to the host (the paying subscriber). Owners never receive these by email — they view their statements in the in-app owner portal only. The exact current wording of each is reproduced below for counsel to review, particularly the VAT treatment.')]))

children.push(h3('1. Subscription payment receipt / invoice'))
children.push(p([run('When sent: ', { bold: true }), run('to the host automatically after every successful subscription payment (initial purchase and each opted-in auto-renewal).')]))
children.push(p([run('Fields shown: ', { bold: true }), run('invoice number (derived from the payment date and reference), date, billed-to email, plan, billing term, access-valid-until date, payment reference, and amount paid. It carries the registered-entity footer (name, CIPC reg no., SARS taxpayer no., registered address, support email).')]))
children.push(p([run('Verbatim VAT note printed on the document: ', { bold: true }), run('“StayKnit is not currently registered for VAT, so no VAT is charged on this amount. This document is a payment receipt / invoice, not a SARS tax invoice.”', { italics: true })]))
children.push(note([noteP('Counsel note (VAT).', 'StayKnit is not yet VAT-registered, so this document is intentionally a receipt/invoice with NO VAT line and explicitly states it is not a SARS tax invoice. Please confirm this wording is correct for a non-VAT-vendor and advise what must change (VAT number, “Tax Invoice” heading, 15% VAT line, VAT-inclusive total) at the point StayKnit registers for VAT, so we can switch the template over cleanly.')]))

children.push(h3('2. Refund confirmation'))
children.push(p([run('When sent: ', { bold: true }), run('to the host when a refund is processed against their subscription payment (driven by the Paystack refund.processed webhook). A full refund also reverts the account to the free tier; a partial refund leaves paid access intact.')]))
children.push(p([run('Fields shown: ', { bold: true }), run('date, plan, original payment reference, amount refunded, and a line stating whether paid access has ended (full refund) or remains active (partial refund), plus the note: “Refunds typically reflect within 5–10 business days, depending on your bank.” Same registered-entity footer.')]))
children.push(note([noteP('Counsel note (refunds).', 'This confirmation is transactional (it records a refund StayKnit has chosen to make); it does not itself grant a refund right. Please ensure it is consistent with the refund position you settle for §5 of the Terms and the CPA/ECTA advice in Part 4C.')]))

children.push(h3('3. Owner statement copy (to the host)'))
children.push(p([run('When sent: ', { bold: true }), run('to the host, on demand, as their own filed copy of a given owner’s payout statement. The owner views the same figures in their in-app portal; the emailed copy goes to the host, not the owner.')]))
children.push(p([run('Fields shown: ', { bold: true }), run('owner name, statement period, property scope, nights booked, gross revenue, each deduction line (e.g. management fee, cleaning), net payout, paid-to-date and outstanding due, and the note: “Payment to the owner is arranged directly by you, not through StayKnit.” Same registered-entity footer.')]))
children.push(note([noteP('Counsel note (statements).', 'The statement figures are computed by the software from host-entered data and synced bookings. This reinforces Part 4E’s question about disclaimers around StayKnit’s calculations: please confirm the “arranged directly by you, not through StayKnit” line and whether any further disclaimer is needed to make clear StayKnit neither holds nor moves owner money and is not responsible for the accuracy of host-entered figures.')]))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ============ PART 6 — CHANNEL-PARTNER DATA PROCESSING & API TERMS ============
children.push(h1('Part 6 — Channel-Partner Data Processing & API Terms'))
children.push(p([run('Purpose: ', { bold: true }), run('the reviewing lawyers asked for "data-processing arrangements with the channel partners, including the API terms." This part answers that request directly. Its most important message is a factual correction, because the honest answer changes what there is to review.')]))
children.push(note([noteP('Founder-prepared, factual — not legal advice.', 'Read alongside Part 1 §1–§3 (what StayKnit is), Part 2 §2c/§4/§7 (guest data, hosting, sub-processors), and Part 3 §8 (best-effort sync).')]))

children.push(h2('1. The headline: there are no channel-partner API agreements or DPAs to hand over'))
children.push(p([run('StayKnit does not hold — and has never signed — an API agreement, partner/connectivity agreement, or data-processing agreement (DPA) with Airbnb, Booking.com, LekkerSlaap, or any other listing site. ', { bold: true }), run('None exist, so none can be attached.')]))
children.push(p('This is not an oversight; it is a consequence of how the product actually works. StayKnit does not connect to any channel’s private/partner API. It exchanges only iCal calendar data using links the host supplies:'))
children.push(bullet([run('Inbound (read-only): ', { bold: true }), run('the host pastes the public iCal export URL their own channel account exposes (Airbnb “Export calendar”, Booking.com “Sync calendars”, LekkerSlaap’s equivalent). StayKnit periodically fetches that URL over HTTPS and reads the busy/available dates. StayKnit sends the channel nothing and authenticates with nothing — no API key, no OAuth token, no partner credential, no host password. It is the same public link any calendar app could read.')]))
children.push(bullet([run('Outbound (dates only, no guest PII): ', { bold: true }), run('StayKnit publishes a .ics feed the host can paste back into a channel to block dates. That feed carries availability/dates only and no guest personal information.')]))
children.push(p('So the integration is a one-way-per-direction iCal file exchange over public links, not an API partnership with a data-sharing contract behind it.'))

children.push(h2('2. Why this matters legally (please confirm)'))
children.push(p('Because there is no API partnership:'))
children.push(numbered([run('StayKnit is not a party to any channel agreement. ', { bold: true }), run('The entity that holds the Airbnb / Booking.com / LekkerSlaap account, agrees to that channel’s terms, and is bound by its data rules is the host, not StayKnit. StayKnit never sees or accepts those terms.')], 'p6list'))
children.push(numbered([run('The only data StayKnit receives from a channel is what a public iCal feed carries ', { bold: true }), run('— principally dates/availability, and depending on the platform a guest display-name or booking reference. StayKnit does not receive guest contact details, ID numbers, or payment data from any channel.')], 'p6list'))
children.push(numbered([run('We believe no DPA between StayKnit and the channels is required, ', { bold: true }), run('precisely because there is no controller-to-processor or processor-to-sub-processor relationship between StayKnit and the channels — but we ask counsel to confirm this characterisation rather than assume it.')], 'p6list'))
children.push(note([noteP('Framing correction.', 'This corrects the external research brief folded into Part 2/Part 3: StayKnit is NOT a full “channel manager” moving bidirectional guest data through partner APIs. Counsel should advise on the narrower iCal reality, not the broader assumption.')]))

children.push(h2('3. What counsel may actually want to review'))
children.push(p('The reviewable material is not StayKnit-to-channel contracts (there are none). It is:'))
children.push(bullet([run('(a) Each channel’s own public terms, ', { bold: true }), run('which bind the host and govern whether the host may export their calendar to a third-party tool like StayKnit — the documents to check for any restriction on third-party iCal use (Airbnb ToS & Privacy Policy; Booking.com partner/Extranet terms & Privacy Statement; LekkerSlaap site terms & privacy notice). We have deliberately not pasted deep-link URLs, because these terms change and each host reaches the current version from inside their own channel account; we will retrieve the exact current text of any one on request.')]))
children.push(bullet([run('(b) StayKnit’s own Terms §7 (“Third-party listing sites”) and §1 (“What StayKnit does”), ', { bold: true }), run('which already state that these sites are independent, that StayKnit only reads host-provided feeds, and that the host must have the right to sync the listings they connect. Counsel is asked to confirm that disclaimer is adequate.')]))
children.push(bullet([run('(c) The POPIA section 72 cross-border question ', { bold: true }), run('for the listing-site vector, already put to counsel in Part 4 §B3.')]))

children.push(h2('4. What StayKnit can provide if counsel needs more'))
children.push(bullet('A live demonstration or screenshots of the host “connect a calendar” flow showing that only a public iCal URL is entered (no login to the channel, no API key).'))
children.push(bullet('The exact fields the sync stores per booking (Part 2 §2c).'))
children.push(bullet('A sample of the outbound .ics feed to confirm it contains dates only and no guest PII.'))
children.push(bullet('The current public terms text of any specific channel, retrieved from a live host account.'))

children.push(h2('5. The three items requested by the reviewing lawyers — where each lives'))
children.push(dataTable(
  ['Requested item', 'Status', 'Where in this pack'],
  [
    ['1. Current Privacy Policy', 'Draft exists, review-ready', 'Part 5 — “Privacy Policy (current copy at /privacy)”'],
    ['2. Terms of Service', 'Draft exists, review-ready', 'Part 5 — “Terms of Service (current copy at /terms)”'],
    ['3. Data-processing arrangements with channel partners, incl. API terms', 'None exist — see this Part', 'Part 6 (this section); factual basis in Parts 1–3'],
  ],
  [3400, 2400, 3200],
))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ============ PART 7 — ADDITIONAL DRAFT CLAUSES, REVIEWED AGAINST THE APP ============
children.push(h1('Part 7 — Additional Draft Clauses, Reviewed Against the App'))
children.push(p([run('Purpose. ', { bold: true }), run('These are founder-proposed new clauses (Confidentiality, IP, Prohibited conduct, Service availability, Force majeure, Assignment, a revised Changes clause, and a Data Processing schedule), reviewed and rewritten to match what the app actually does and to fit the current published Terms. They remain founder-drafted starting points, not vetted legal advice — every clause needs attorney review before publication.')]))
children.push(p([run('Read together with ', {}), run('Part 5', { bold: true }), run(' (the live Terms/Privacy this builds on) and ', {}), run('Part 6', { bold: true }), run(' (the iCal-only, no-API reality several clauses depend on).')]))

children.push(h2('What was changed in review, and why'))
children.push(p([run('The founder draft assumed the Terms ran §1–§10 and appended new clauses as §11–§17. The ', {}), run('live Terms now run §1–§13', { bold: true }), run(' (age/capacity, licence, and third-party listing sites were added 22 Sep 2026). That stale assumption created real overlaps, resolved as follows:')]))
children.push(dataTable(
  ['Founder draft', 'Issue found against the live app', 'Resolution'],
  [
    ['§12 Intellectual Property', 'Re-grants a use licence that live §4 (Licence) already grants — two grants would conflict', 'Kept ownership + “host retains rights in its own data”; removed the duplicate grant; cross-referenced §4'],
    ['§13 Prohibited conduct', 'Reverse-engineer/copy already in live §4; “access another host’s data” already in live §5', 'Trimmed to genuinely new items (malware, scraping/bots, vulnerability probing); cross-referenced §4/§5'],
    ['§17 Changes (revised)', 'Duplicates live §11 (Changes and termination)', 'Treated as a replacement for live §11, not an add-on'],
    ['Numbering of all new clauses', 'Would collide with live §11–§13 and push Contact out of last position', 'Renumbered so Governing law and Contact stay last (map at end)'],
    ['Sched. §4 security', 'Claimed “optional two-factor authentication”', 'Verified accurate — 2FA exists (app/2fa, two-factor-card.tsx, lib/auth.ts)'],
    ['Sched. §3 sub-processors', 'Generic names', 'Aligned to exact names in Privacy Policy §4 (Vercel, Neon, Paystack, Namecheap)'],
  ],
  [2200, 3600, 3200],
))
children.push(p([run('Kept substantively as-is (already right for the app): ', {}), run('Confidentiality, Service availability, Force majeure, Assignment, and the whole Data Processing schedule.', { italics: true })]))

children.push(h2('Part A — Clauses to insert into the Terms of Service'))
children.push(p([run('Insert after live §10 (Disclaimers and limitation of liability) and before Governing law/Contact. The revised §11 replaces the current §11.', { italics: true })]))

children.push(h3('§11. Changes and termination (revised — replaces the current §11)'))
children.push(p('StayKnit may update these Terms from time to time. For material changes, StayKnit will give existing hosts at least 14 days’ notice by email or in-app notification before the change takes effect. If a host objects to a material change in writing before it takes effect, StayKnit will not apply the change to that host’s account; in that case StayKnit may terminate the host’s subscription with effect from the date the change would otherwise have applied, subject to a pro-rata refund of any prepaid, unused balance. Continued use of the Service after a change takes effect constitutes acceptance of it. You may stop using the Service and delete your account at any time. StayKnit may suspend or terminate access for breach of these Terms.'))
children.push(note([noteP('Counsel note (§11).', 'Strengthens the current live §11 (which only says changes are “reflected by the last updated date”). Confirm the 14-day notice, object→terminate→pro-rata mechanism, and “continued use = acceptance” are CPA/ECTA-compliant and consistent with the notice-period + pro-rata refund already in §8 (Billing and cancellation).')]))

children.push(h3('§12. Confidentiality (new)'))
children.push(p('“Confidential Information” means any non-public information disclosed by one party to the other in connection with the Service, including business, financial, and technical information, and — for the avoidance of doubt — any owner or guest data a host enters into the Service. Each party will use the other’s Confidential Information only to perform its obligations under these Terms, and will not disclose it to any third party except: (a) to employees, contractors, or professional advisers who need it and who are bound by at least as strict confidentiality obligations; (b) where the information is or becomes public through no fault of the receiving party; (c) where the receiving party already lawfully held it before disclosure; or (d) where disclosure is required by law, regulation, or a competent authority. This clause survives termination.'))
children.push(note([noteP('Counsel note (§12).', 'New. The owner/guest-data carve-in is intentional and dovetails with the Data Processing schedule in Part B — confirm the two are consistent.')]))

children.push(h3('§13. Intellectual property (new — licence grant deliberately omitted; see §4)'))
children.push(p('StayKnit and its licensors own all right, title, and interest in the Service, including its software, design, trademarks, and documentation. The limited licence granted to you is set out in §4 (Licence to use the Service); no other rights are granted. You retain all rights in the data you enter into the Service (property, owner, and guest records) and in your own trademarks and content.'))
children.push(note([noteP('Counsel note (§13).', 'Rewritten to avoid a second licence grant conflicting with §4. Confirm the ownership/host-data split is the position StayKnit wants.')]))

children.push(h3('§14. Prohibited conduct (new — trimmed to avoid overlap with §4 and §5)'))
children.push(p('In addition to the licence restrictions in §4 and the acceptable-use obligations in §5, the host must not, and must not permit any user of its account to: (a) introduce viruses, malware, or other harmful code into the Service; (b) use automated means (scraping, bots) to extract data from the Service beyond the export tools StayKnit provides; or (c) probe, scan, or test the vulnerability of the Service, or breach or circumvent its security, without authorisation.'))
children.push(note([noteP('Counsel note (§14).', 'The founder draft also listed reverse-engineering, copying, and accessing other users’ data — already covered by live §4 and §5, so removed here to prevent duplicative/conflicting drafting. Confirm nothing essential was lost.')]))

children.push(h3('§15. Service availability (new)'))
children.push(p('StayKnit targets high availability but does not guarantee uninterrupted access. Planned maintenance will, where practicable, be scheduled outside peak hours and notified in advance. StayKnit is not liable for unavailability caused by factors outside its reasonable control, including outages at its hosting or database providers or at third-party listing sites.'))
children.push(note([noteP('Counsel note (§15).', 'Accurate to the stack (Vercel hosting, Neon database, host-provided iCal feeds). Consistent with §6 (best-effort sync) and §7 (third-party listing sites).')]))

children.push(h3('§16. Force majeure (new)'))
children.push(p('Neither party is liable for any failure or delay in performance caused by circumstances beyond its reasonable control, including fire, flood, war, pandemic, labour disputes, or the failure of a third-party service StayKnit relies on to deliver the Service (including hosting, database, payment, or listing-site providers). The affected party’s obligations are suspended for the duration of the event and a reasonable period afterwards to resume normal operation.'))

children.push(h3('§17. Assignment (new)'))
children.push(p('The host may not assign or transfer its rights or obligations under these Terms without StayKnit’s prior written consent. StayKnit may assign these Terms in connection with a merger, acquisition, reorganisation, or sale of substantially all of its assets, provided the assignee agrees to be bound by these Terms.'))

children.push(h3('§18. Governing law (unchanged — renumbered from §12) · §19. Contact (unchanged — renumbered from §13)'))

children.push(h2('Part B — Schedule 1: Data Processing Terms (new schedule, incorporated by reference)'))
children.push(p([run('For owner and guest data the host enters, StayKnit is the ', {}), run('operator', { bold: true }), run(' on the host’s documented instructions and the ', {}), run('host is the responsible party', { bold: true }), run('; for host account data, StayKnit is the responsible party (per the Privacy Policy). This addresses the operator/responsible-party question in Part 4 §B1.')]))
children.push(p([run('1. Roles and scope. ', { bold: true }), run('This Schedule applies to StayKnit’s processing of personal information the host enters into, or generates through use of, the Service concerning the host’s owners and guests (“Customer Personal Information”). As between the parties, the host is the responsible party (controller) and StayKnit is the operator (processor), processing it only to provide the Service and on the host’s documented instructions.')]))
children.push(p([run('2. Nature and purpose. ', { bold: true }), run('StayKnit processes Customer Personal Information to sync calendar availability, display bookings, generate owner statements, and provide the owner portal. Data subjects are owners and guests as described in the Privacy Policy. No special personal information (POPIA) / special category data (GDPR) is intentionally processed.')]))
children.push(p([run('3. Sub-processors. ', { bold: true }), run('The host consents to StayKnit engaging the sub-processors disclosed in the Privacy Policy — currently Vercel Inc. (hosting/CDN/analytics), Neon Inc. (database), Paystack Payments Limited (payments), and Namecheap Private Email (transactional email). StayKnit will give at least 14 days’ notice before engaging or replacing a sub-processor. If a host reasonably objects on data-protection grounds, the parties will work in good faith to resolve it; failing resolution, either party may terminate the affected part of the Service with a pro-rata refund of any prepaid balance.')]))
children.push(note([noteP('Counsel note (Sched. 1 §3).', 'The four names match Privacy Policy §4 exactly. StayKnit uses no channel/listing-site API and holds no data-processing agreement with Airbnb/Booking.com/LekkerSlaap (see Part 6) — those sites are NOT StayKnit sub-processors.')]))
children.push(p([run('4. Security measures. ', { bold: true }), run('StayKnit will maintain the technical and organisational measures in its Security & Safety Framework (Part 5-adjacent), including per-tenant data scoping, hashed credentials, optional two-factor authentication, HTTPS/HSTS, and a documented data-retention and deletion process. StayKnit may update these measures provided the overall level of security is not reduced.')]))
children.push(note([noteP('Counsel note (Sched. 1 §4).', 'All measures listed are implemented today — per-account scoping, Better Auth password hashing, HttpOnly sessions, and 2FA (app/2fa, components/two-factor-card.tsx). Safe to represent.')]))
children.push(p([run('5. Assistance with data-subject requests. ', { bold: true }), run('Where StayKnit receives a request directly from an owner or guest, it will inform the host without undue delay and will not respond directly except on the host’s documented instruction, unless required by law. StayKnit will provide reasonable assistance, including through the Service’s self-service export and deletion tools (which exist today in Settings).')]))
children.push(p([run('6. Cross-border transfers. ', { bold: true }), run('The host acknowledges Customer Personal Information may be processed and stored outside South Africa by StayKnit’s hosting and database sub-processors. StayKnit will ensure any such transfer is subject to appropriate safeguards — contractual terms consistent with POPIA section 72 and, where applicable, GDPR Chapter V mechanisms — and will document the basis on request.')]))
children.push(note([noteP('Counsel note (Sched. 1 §6).', 'Ties to the open s72 question in Part 4 §B3. Vercel and Neon regions/data-residency should be confirmed and named here once counsel advises.')]))
children.push(p([run('7. Personal data breach notification. ', { bold: true }), run('If StayKnit becomes aware of a compromise affecting Customer Personal Information, it will notify the host without undue delay and in any event within 72 hours, with the information reasonably available to enable the host to meet its own obligations (POPIA s22; GDPR Arts 33–34).')]))
children.push(p([run('8. Audit rights. ', { bold: true }), run('On at least 30 days’ written notice and no more than once a year (except after a compromise), the host may request evidence of compliance, which StayKnit may satisfy by a written summary of its measures, sub-processor certifications, or a remote/on-site audit during business hours at the host’s cost, subject to confidentiality safeguards.')]))
children.push(p([run('9. Deletion or return on termination. ', { bold: true }), run('On termination, StayKnit will delete or (on request made before termination) export the host’s Customer Personal Information, save for data it must retain by law or for legitimate backup. This aligns with the 12-month inactivity auto-purge and self-service deletion already in the app.')]))
children.push(p([run('10. Precedence. ', { bold: true }), run('This Schedule applies specifically to Customer Personal Information and does not alter StayKnit’s role as responsible party for host account data, which remains governed by the Privacy Policy.')]))

children.push(h2('Renumbering map (current live → proposed)'))
children.push(dataTable(
  ['Live now', 'Proposed'],
  [
    ['§1–§10', 'unchanged'],
    ['§11 Changes and termination', '§11 (revised text above)'],
    ['—', '§12 Confidentiality (new)'],
    ['—', '§13 Intellectual property (new)'],
    ['—', '§14 Prohibited conduct (new)'],
    ['—', '§15 Service availability (new)'],
    ['—', '§16 Force majeure (new)'],
    ['—', '§17 Assignment (new)'],
    ['§12 Governing law', '§18'],
    ['§13 Contact', '§19'],
    ['—', 'Schedule 1 — Data Processing Terms (new)'],
  ],
  [4500, 4500],
))
children.push(note([noteP('If adopted:', 'the in-app /terms copy and lib/legal.ts must be updated to match, and the Terms “last updated” date bumped. Nothing here is live yet. This is general drafting to support a legal review, not legal advice.')]))

// ---------- assemble ----------
const doc = new Document({
  creator: 'StayKnit',
  title: 'StayKnit — Legal & Compliance Pack',
  description: 'Founder-prepared legal briefing for counsel',
  numbering: {
    config: ['p1list', 'p2list', 'p3list', 'p3blist', 'p3clist', 'p3elist', 'p6list'].map((ref) => ({
      reference: ref,
      levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }],
    })),
  },
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  sections: [
    {
      properties: { page: { margin: { top: 1200, bottom: 1200, left: 1180, right: 1180 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'StayKnit — Legal & Compliance Pack', font: FONT, size: 16, color: SLATE })] })],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Confidential — founder briefing for counsel · Page ', font: FONT, size: 16, color: SLATE }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: SLATE }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
})

// Written to docs/legal/ (NOT public/) — this pack contains the company
// registration number and registered address and must not be publicly served.
mkdirSync('docs/legal', { recursive: true })
const buffer = await Packer.toBuffer(doc)
writeFileSync('docs/legal/StayKnit-Legal-Pack.docx', buffer)
console.log('Wrote docs/legal/StayKnit-Legal-Pack.docx (' + buffer.length + ' bytes)')
