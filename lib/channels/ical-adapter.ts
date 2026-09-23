// The one adapter that actually works today. It fetches a real iCal (.ics)
// availability feed, parses it with node-ical, and returns reservation dates +
// status ONLY. It declares `financials: false` and always returns an empty
// financials array — it is structurally incapable of producing a price, which
// is the whole point: an availability feed never contains one, so we never
// invent one.

import ical, { type VEvent } from 'node-ical'
import { normalizeIcalUrl, isBlockSummary } from '@/lib/ical'
import type {
  ChannelAdapter,
  ChannelConnection,
  ChannelSyncResult,
  Reservation,
  ReservationStatus,
} from './types'

const FETCH_TIMEOUT_MS = 15_000

// Fetch the feed text ourselves (with a hard timeout and a UA) rather than
// letting node-ical drive the network, so failures are explicit and we control
// redirects/headers. node-ical then only PARSES already-fetched text.
async function fetchFeed(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'StayKnit-ChannelSync/1.0 (+https://stayknit.org)' },
    })
    if (!res.ok) throw new Error(`feed responded ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// node-ical returns Date objects. All-day (DATE) values land on UTC midnight, so
// the UTC calendar day is exactly the intended availability day. DATE-TIME
// values are day-granular for availability purposes; we take the UTC date.
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

// SUMMARY may be a bare string or a params object depending on the feed.
function summaryText(ev: VEvent): string {
  const s = ev.summary as unknown
  if (typeof s === 'string') return s
  if (s && typeof s === 'object' && 'val' in s) return String((s as { val: unknown }).val ?? '')
  return ''
}

// Availability status only. A block/owner-hold marker beats everything; a
// cancelled/tentative VEVENT STATUS is respected; otherwise it's a confirmed
// stay. No branch here can ever reach a financial field — there is none to read.
function statusFor(ev: VEvent, summary: string): ReservationStatus {
  if (isBlockSummary(summary)) return 'block'
  const raw = (ev.status as string | undefined)?.toUpperCase()
  if (raw === 'CANCELLED') return 'cancelled'
  if (raw === 'TENTATIVE') return 'tentative'
  return 'confirmed'
}

export const icalAdapter: ChannelAdapter = {
  channel: 'ICAL',
  displayName: 'iCal feed',
  capabilities: { availability: true, financials: false },

  isReady(connection: ChannelConnection): boolean {
    return !!(connection.icalUrl && normalizeIcalUrl(connection.icalUrl))
  },

  async fetch(connection: ChannelConnection): Promise<ChannelSyncResult> {
    const url = connection.icalUrl ? normalizeIcalUrl(connection.icalUrl) : null
    if (!url) {
      // Not an AwaitingCredentialsError — iCal needs no credentials, it needs a
      // valid URL. A misconfigured feed is a plain error the operator can fix.
      throw new Error('iCal adapter has no valid feed URL')
    }

    const text = await fetchFeed(url)
    const parsed = ical.sync.parseICS(text)

    const reservations: Reservation[] = []
    for (const value of Object.values(parsed)) {
      if (!value || (value as { type?: string }).type !== 'VEVENT') continue
      const ev = value as VEvent
      if (!ev.start) continue

      const checkIn = toIsoDate(ev.start as Date)
      // A missing DTEND means a single-night event: checkout = check-in + 1.
      const checkOut = ev.end ? toIsoDate(ev.end as Date) : addDay(checkIn)
      const summary = summaryText(ev)
      const status = statusFor(ev, summary)

      reservations.push({
        channel: 'ICAL',
        // UID is effectively always present; fall back to a deterministic id so
        // reconciliation stays stable even for a feed that omits it.
        externalBookingId: ev.uid || `${connection.propertyId}:${checkIn}:${checkOut}`,
        propertyId: connection.propertyId,
        userId: connection.userId,
        // Availability feeds don't carry guest identities; a non-block summary
        // (e.g. "Reserved") is the most we surface, never anything financial.
        guestName: status === 'block' ? null : summary || null,
        checkIn,
        checkOut,
        status,
        raw: { uid: ev.uid, summary, datetype: ev.datetype },
      })
    }

    // Hard invariant: this adapter NEVER emits financial data.
    return { reservations, financials: [] }
  },
}
