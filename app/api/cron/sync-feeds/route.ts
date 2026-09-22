import { NextResponse } from 'next/server'
import { isNull, lte, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { feed } from '@/lib/db/schema'
import { syncFeedsForUser } from '@/app/actions/stayknit'
import { reportServerError } from '@/lib/email'

// Scheduled background iCal sync (see vercel.json). Pulls every host's channel
// feeds on a cadence so double-booking protection stays fresh even if the host
// never opens the app. Per-feed backoff lives in syncFeedsForUser: a healthy
// feed is re-synced every few hours, a failing one is retried with exponential
// backoff (30m → capped at 24h) instead of being hammered every run.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET is not configured.' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    // Distinct hosts that have at least one feed due for a sync attempt.
    const dueUsers = await db
      .selectDistinct({ userId: feed.userId })
      .from(feed)
      .where(or(isNull(feed.nextRetryAt), lte(feed.nextRetryAt, now)))

    let usersSynced = 0
    let feedsReached = 0
    let feedsFailed = 0
    const errors: string[] = []

    for (const { userId } of dueUsers) {
      try {
        const r = await syncFeedsForUser(userId, { onlyDue: true, skipIfNoAccess: true })
        if (r.feeds > 0) usersSynced++
        feedsReached += r.reachable
        feedsFailed += r.errors.length
      } catch (err) {
        // One host's failure must not abort the whole batch.
        errors.push(`${userId}: ${(err as Error).message}`)
      }
    }

    // Surface a systemic problem (e.g. every host failing) to the operator.
    if (errors.length > 0) {
      await reportServerError('sync-feeds cron', new Error(`${errors.length} host(s) errored`), {
        sampleErrors: errors.slice(0, 5).join(' | '),
        dueUsers: dueUsers.length,
      })
    }

    return NextResponse.json({
      ok: true,
      dueUsers: dueUsers.length,
      usersSynced,
      feedsReached,
      feedsFailed,
      hostErrors: errors.length,
    })
  } catch (err) {
    await reportServerError('sync-feeds cron', err)
    return NextResponse.json({ ok: false, error: 'Feed sync run failed.' }, { status: 500 })
  }
}
