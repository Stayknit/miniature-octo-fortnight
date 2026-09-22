import { db } from '@/lib/db'
import { booking, property } from '@/lib/db/schema'
import { buildIcalFeed, exportSummary, selectExportableBookings, type IcalExportEvent } from '@/lib/ical-export'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

// Public, unauthenticated OUTGOING iCal feed for a single unit, served at
// /ical/<token>.ics. The opaque per-unit token (property.icalFeedToken) is the
// only credential — knowing it grants read access to that unit's block dates
// and nothing else. See lib/ical-export.ts for the echo-safety contract.
export const dynamic = 'force-dynamic'

// Stable UID host part. Deliberately fixed (not the request host) so a unit's
// event UIDs stay identical across preview/prod and OTA re-imports.
const UID_DOMAIN = 'stayknit.org'

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params
  // The path segment includes the .ics suffix (…/<token>.ics). Strip it, then
  // require a plausible token so a bare/garbage request is a clean 404.
  const token = raw.replace(/\.ics$/i, '').trim()
  if (!token || token.length < 16) {
    return new NextResponse('Not found', { status: 404 })
  }

  const [unit] = await db.select().from(property).where(eq(property.icalFeedToken, token)).limit(1)
  if (!unit) {
    return new NextResponse('Not found', { status: 404 })
  }

  const rows = await db
    .select()
    .from(booking)
    .where(and(eq(booking.userId, unit.userId), eq(booking.propertyName, unit.name)))

  const today = new Date().toISOString().slice(0, 10)
  const events: IcalExportEvent[] = selectExportableBookings(rows, today).map((b) => ({
    uid: `stayknit-booking-${b.id}@${UID_DOMAIN}`,
    start: b.checkIn,
    end: b.checkOut,
    summary: exportSummary(b),
  }))

  const body = buildIcalFeed({
    name: `${unit.name} · StayKnit`,
    domain: UID_DOMAIN,
    events,
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${unit.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics"`,
      // OTAs poll on their own schedule (hours). Let the CDN cache briefly and
      // serve stale while revalidating so a burst of pollers doesn't hit the DB.
      'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600',
    },
  })
}
