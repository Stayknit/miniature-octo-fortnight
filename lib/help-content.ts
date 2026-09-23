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
    id: 'today-screen',
    kicker: 'Today tab',
    title: 'Your Today screen',
    summary: 'Where you land each day: arrivals, departures, and a place to add bookings or blocks by hand.',
    steps: [
      { text: 'Today lists arrivals and departures across your units for the day.' },
      { text: 'New stays pulled from synced feeds appear here for you to acknowledge.' },
      { text: 'Tap “New direct booking” to record a stay booked outside any listing site — a phone, walk-in, or repeat guest.' },
      { text: 'Add a block to hold dates for an owner stay or maintenance.', note: 'Direct bookings and blocks both close those nights on your published feed, so no site can book them.' },
    ],
    keywords: 'today home arrivals departures acknowledge direct booking block maintenance walk-in phone',
  },
  {
    id: 'calendar-screen',
    kicker: 'Calendar tab',
    title: 'The calendar view',
    summary: 'Every unit’s stays and blocks on one grid, merged from all channels.',
    steps: [
      { text: 'Open the Calendar tab to see all of your units across the month.' },
      { text: 'Bookings and blocks from every connected site are merged into one view.' },
      { text: 'Tap a direct booking to edit its dates or guest, or to cancel it.', note: 'Stays imported from a listing site are managed on that site, not here.' },
      { text: 'Under “Channel bookings”, tap a stay to enter its price.', note: 'iCal feeds never send the amount a guest paid, so imported stays arrive with no price. Add it here and it counts on statements and owner payouts — and it sticks through every future sync.' },
    ],
    keywords: 'calendar month grid view edit direct booking cancel merged channel booking price amount statement payout ical no price',
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
    id: 'publish-feed',
    kicker: 'Channels tab',
    title: 'Publish StayKnit’s calendar',
    summary: 'Give each listing site a StayKnit feed so the holds you create here — owner stays, maintenance, direct bookings — close those dates on every site too.',
    steps: [
      { text: 'In the Channels tab, find the unit and tap “Publish feed” to generate its StayKnit iCal URL.' },
      { text: 'Copy the .ics link and add it on each listing site as an imported calendar.' },
      { text: 'Now the direct bookings, owner stays, and blocks you add in StayKnit block those nights on every connected site.' },
      { text: 'The link is private — anyone with it can see that unit’s blocked dates.', note: 'Use Regenerate to issue a fresh link if one ever leaks. Sites refresh imported calendars on their own schedule, usually every few hours.' },
    ],
    keywords: 'publish export outgoing feed ics url two-way sync block owner stay maintenance regenerate stop private',
  },
  {
    id: 'owners-statements',
    kicker: 'Owners tab',
    title: 'Owners & statements',
    summary: 'Give owners a read-only view of their units and share monthly payout statements.',
    steps: [
      { text: 'Each property is linked to an owner in the Owners tab.' },
      { text: 'Open an owner and tap “Create login” to give them a read-only account for their own units, bookings, and statements.' },
      { text: 'Turn on “Owner portal access” to let them in.', note: 'Access needs a login first, so create the login before flipping the toggle. Owners only ever see their own units.' },
      { text: 'Set your commission and business details in Settings so statements print correctly.' },
    ],
    keywords: 'owner login create access toggle statement payout commission read only',
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
