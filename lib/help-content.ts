// Shared help knowledge base. The client renders these as browsable topics and
// the AI assistant route uses them as grounding context, so both stay in sync
// from one source.

// A step within a topic. `note` renders as a muted sub-line under the step.
export type Step = { text: string; note?: string }

export type Topic = {
  id: string
  kicker: string
  title: string
  summary: string
  steps: Step[]
  // Extra words to widen search matches beyond the visible copy.
  keywords?: string
}

export type Role = 'host' | 'owner'

// Core host workflows, ordered the way a new host actually moves through the
// app: understand the model, add a unit, connect its feeds, import, then owners
// and billing.
export const HOST_TOPICS: Topic[] = [
  {
    id: 'how-sync-works',
    kicker: 'Start here',
    title: 'How StayKnit keeps one calendar',
    summary: 'Every listing site points at the same StayKnit calendar, so a stay booked anywhere blocks those dates everywhere.',
    steps: [
      { text: 'StayKnit reads the iCal feed each site publishes for a unit.', note: 'iCal is a standard calendar file every major booking site exports.' },
      { text: 'Feeds sync availability only — dates in and out, not guest names or messages.' },
      { text: 'When one site takes a booking, StayKnit blocks those nights on the others so you never get a double-booking.' },
    ],
    keywords: 'ical calendar double booking availability overview',
  },
  {
    id: 'add-property',
    kicker: 'Owners tab',
    title: 'Add a property',
    summary: 'Create the unit first, then link it to its owner. Feeds are connected separately.',
    steps: [
      { text: 'Open the Owners tab and tap “Add property”.' },
      { text: 'Enter the unit name, choose its type, and add a short spec line.', note: 'The name is how feeds and bookings are matched, so keep it consistent.' },
      { text: 'Link an owner by name (and email, so they can get statements).' },
      { text: 'Save. Then head to the Channels tab to connect its iCal feeds.' },
    ],
    keywords: 'unit cottage room owner add new listing',
  },
  {
    id: 'connect-feeds',
    kicker: 'Channels tab',
    title: 'Connect iCal feeds',
    summary: 'A unit can be listed on several sites at once — connect one feed per site so all of them stay in sync.',
    steps: [
      { text: 'In the Channels tab, choose the property and the listing site (Airbnb, Booking.com, LekkerSlaap…).' },
      { text: 'Paste that site’s iCal export URL for the unit and tap Connect.', note: 'Each site gives a different URL per unit — add all of them.' },
      { text: 'Repeat for every site the unit appears on. Connected feeds are listed with a Remove button.' },
    ],
    keywords: 'channel feed airbnb booking.com lekkerslaap url link multiple remove',
  },
  {
    id: 'find-ical-url',
    kicker: 'Channels tab',
    title: 'Find a site’s iCal URL',
    summary: 'Where each major site hides its “export calendar” link.',
    steps: [
      { text: 'Airbnb: Listing → Availability → Connect calendars → Export calendar.' },
      { text: 'Booking.com: Rates & Availability → Sync calendars → Export.' },
      { text: 'LekkerSlaap / others: look for “iCal”, “Export calendar”, or a .ics link in availability settings.' },
      { text: 'Copy the full link ending in .ics and paste it into the Channels form.' },
    ],
    keywords: 'export calendar ics link airbnb booking where find',
  },
  {
    id: 'import-bookings',
    kicker: 'Channels tab',
    title: 'Import & sync bookings',
    summary: 'Pull the latest stays from every connected feed into your one calendar.',
    steps: [
      { text: 'Tap “Sync now” in the Channels tab to fetch every connected feed.' },
      { text: 'New stays appear as bookings; dates already imported are skipped so nothing duplicates.' },
      { text: 'Unreachable feeds are reported by name — recheck the URL if a site is listed there.' },
      { text: 'Auto-sync runs on the schedule set in Settings → Sync.' },
    ],
    keywords: 'sync import fetch refresh bookings unreachable schedule',
  },
  {
    id: 'owners-statements',
    kicker: 'Owners tab',
    title: 'Owners & statements',
    summary: 'Give owners a read-only view of their units and share monthly payout statements.',
    steps: [
      { text: 'Each property is linked to an owner in the Owners tab.' },
      { text: 'Create a read-only login for an owner to see their own units, bookings and statements.' },
      { text: 'Set your commission and business details in Settings so statements print correctly.' },
    ],
    keywords: 'owner login statement payout commission read only',
  },
  {
    id: 'plan-billing',
    kicker: 'Plan tab',
    title: 'Plan & billing',
    summary: 'The free trial syncs a limited number of units live; upgrading lifts the cap.',
    steps: [
      { text: 'On the trial, only your first units sync live — extra units are locked until you upgrade.' },
      { text: 'Open the Plan tab to see your current plan and upgrade.' },
      { text: 'The unit cap counts units, not feeds — a unit with three feeds still counts as one.' },
    ],
    keywords: 'trial upgrade subscription cap limit locked units billing',
  },
]

// Owner portal is read-only: Overview, Calendar, and Statement. Owners don't
// add units, connect feeds, or manage billing — their host does — so their help
// explains what they can see and who to contact for changes.
export const OWNER_TOPICS: Topic[] = [
  {
    id: 'owner-portal',
    kicker: 'Start here',
    title: 'Your owner portal',
    summary: 'A read-only view of your own units, kept up to date by your managing host.',
    steps: [
      { text: 'You see only your units and their bookings — nothing from other owners.' },
      { text: 'Your host manages the listings, prices, and channel connections for you.' },
      { text: 'The portal has three tabs: Overview, Calendar, and Statement.' },
    ],
    keywords: 'owner read only portal access what can i see host manages',
  },
  {
    id: 'owner-overview',
    kicker: 'Overview tab',
    title: 'Your Overview',
    summary: 'A snapshot of your units, upcoming stays, and how the month is tracking.',
    steps: [
      { text: 'Open the Overview tab to see each of your units at a glance.' },
      { text: 'Upcoming and current stays are listed with their dates.' },
      { text: 'Tap through to the Calendar or Statement for the full detail.' },
    ],
    keywords: 'overview dashboard home units upcoming stays snapshot earnings',
  },
  {
    id: 'owner-calendar',
    kicker: 'Calendar tab',
    title: 'Your calendar',
    summary: 'See exactly when your units are booked or blocked, merged from every channel.',
    steps: [
      { text: 'Open the Calendar tab to see bookings across all of your units.' },
      { text: 'Dates are merged from every listing site your host has connected.' },
      { text: 'The calendar is read-only — contact your host to change a booking.' },
    ],
    keywords: 'calendar bookings blocked dates availability read only channels',
  },
  {
    id: 'owner-statement',
    kicker: 'Statement tab',
    title: 'Read your statement',
    summary: 'Your payout breakdown: gross income, the host commission, costs, and your net.',
    steps: [
      { text: 'Open the Statement tab to see income from stays in the period.' },
      { text: 'The host commission and any costs are itemised and subtracted.' },
      { text: 'Your net payout is the total at the bottom.', note: 'Commission and cost lines are set by your host.' },
    ],
    keywords: 'statement payout commission costs net income gross earnings money',
  },
  {
    id: 'owner-changes',
    kicker: 'Good to know',
    title: 'Need a change?',
    summary: 'Listings, pricing, and bookings are managed by your host, not from this portal.',
    steps: [
      { text: 'To adjust pricing, availability, or a listing, contact your host directly.' },
      { text: 'The portal always reflects your host’s latest synced data.' },
      { text: 'Use the support form below for help with the portal itself.' },
    ],
    keywords: 'change edit contact host support pricing availability cannot',
  },
]

export function topicsFor(role: Role): Topic[] {
  return role === 'owner' ? OWNER_TOPICS : HOST_TOPICS
}

// Flattens the role's topics into a plain-text knowledge base for the
// assistant's system prompt.
export function buildHelpKnowledge(role: Role): string {
  return topicsFor(role)
    .map((t) => {
      const steps = t.steps
        .map((s, i) => `  ${i + 1}. ${s.text}${s.note ? ` (${s.note})` : ''}`)
        .join('\n')
      return `## ${t.title} [${t.kicker}]\n${t.summary}\n${steps}`
    })
    .join('\n\n')
}
