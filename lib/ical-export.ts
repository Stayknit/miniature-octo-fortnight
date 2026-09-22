// Dependency-free iCalendar (.ics) WRITER for StayKnit's OUTGOING availability
// feed — the mirror of lib/ical.ts (the reader). Booking sites (Airbnb,
// Booking.com, Nightsbridge, …) subscribe to one URL per unit and import the
// VEVENTs here as blocked dates, so a hold created inside StayKnit propagates
// out to the OTAs.
//
// IMPORTANT — echo safety: this feed must only ever carry StayKnit-ORIGIN holds
// (manual blocks + direct bookings). OTA-imported reservations are deliberately
// excluded upstream (see selectExportableBookings) so an OTA never re-imports
// its own reservation back through StayKnit and mistakes it for a new one.

export type IcalExportEvent = {
  uid: string
  start: string // yyyy-mm-dd (inclusive first night)
  end: string // yyyy-mm-dd (exclusive checkout day — matches iCal all-day DTEND)
  summary: string
}

// The subset of a booking row this module needs. Kept structural so the caller
// can pass Drizzle rows without a type import cycle.
export type ExportableBooking = {
  id: number
  channel: string
  status: string
  checkIn: string
  checkOut: string
  reason: string
  sourceFeedId: number | null
}

// Pick the bookings that belong in a unit's outgoing feed:
//  • StayKnit-origin only (sourceFeedId IS NULL) — never rebroadcast an OTA's
//    own reservation back to it.
//  • Not departed (status !== 'checkout') and not ended before `today`, so the
//    feed stays small and only reflects live/future holds.
// `today` is passed in (yyyy-mm-dd) so the caller controls the clock/timezone.
export function selectExportableBookings<T extends ExportableBooking>(rows: T[], today: string): T[] {
  return rows.filter(
    (b) =>
      b.sourceFeedId == null &&
      b.status !== 'checkout' &&
      !!b.checkIn &&
      !!b.checkOut &&
      b.checkOut > b.checkIn &&
      b.checkOut > today,
  )
}

// A neutral, PII-free summary. A public feed URL must never leak a guest's
// name, so DIRECT guest bookings surface as a generic hold; only host-authored
// block reasons (not guest data) are ever shown.
export function exportSummary(b: ExportableBooking): string {
  if (b.channel === 'BLOCK') return b.reason?.trim() || 'Not available'
  return 'Reserved'
}

// yyyy-mm-dd -> yyyymmdd for a VALUE=DATE property.
function toIcalDate(iso: string): string {
  return iso.replace(/-/g, '')
}

// Escape a TEXT value per RFC 5545 §3.3.11 (backslash, semicolon, comma,
// newline). Colons are NOT escaped in TEXT values.
function escapeText(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Fold a content line to <=75 octets per RFC 5545 §3.1, continuing with CRLF +
// a single leading space. We fold on byte length (UTF-8) so multi-byte
// characters aren't split across the 75-octet boundary incorrectly.
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const out: string[] = []
  let current = ''
  let currentBytes = 0
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length
    // First line budget is 75; continuation lines reserve 1 octet for the
    // leading space, so their budget is 74.
    const budget = out.length === 0 ? 75 : 74
    if (currentBytes + chBytes > budget) {
      out.push(current)
      current = ''
      currentBytes = 0
    }
    current += ch
    currentBytes += chBytes
  }
  out.push(current)
  return out.map((l, i) => (i === 0 ? l : ' ' + l)).join('\r\n')
}

// yyyy-mm-ddThh:mm:ss(.sss)Z -> yyyymmddThhmmssZ for DTSTAMP (UTC timestamp).
function toIcalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Serialize a calendar. `name` shows as the calendar's display name in clients;
// `domain` is the stable UID host part; `now` is the DTSTAMP (defaults to the
// current time). Lines are CRLF-joined and folded per spec.
export function buildIcalFeed(opts: {
  name: string
  domain: string
  events: IcalExportEvent[]
  now?: Date
}): string {
  const stamp = toIcalStamp(opts.now ?? new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StayKnit//Availability//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
  ]
  for (const e of opts.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcalDate(e.start)}`,
      `DTEND;VALUE=DATE:${toIcalDate(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      'TRANSP:OPAQUE',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
