import { NextResponse } from 'next/server'
import { and, eq, gt, inArray, isNotNull, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { subscription, user } from '@/lib/db/schema'
import { sweepInactiveProfiles } from '@/app/actions/stayknit'
import { reportServerError, sendSubscriptionExpiringEmail, sendTrialEndingEmail } from '@/lib/email'
import { EXPIRY_REMINDER_DAYS, TRIAL_REMINDER_DAYS, TRIAL_URGENT_DAYS, isPaid, planFor } from '@/lib/plans'

// Runs daily (see vercel.json). Emails two audiences, each in two stages so
// nobody is emailed more than once per stage:
//
//   PAID terms ending soon (subscription.expiryNoticeStage):
//     stage 0 -> EARLY notice when <= EXPIRY_REMINDER_DAYS (14) days remain
//     stage 1 -> URGENT notice when <= 3 days remain
//     stage 2 -> done for this term (re-armed to 0 when the term is renewed)
//
//   FREE TRIALS ending soon (subscription.trialNoticeStage):
//     stage 0 -> EARLY notice when <= TRIAL_REMINDER_DAYS (5) days remain
//     stage 1 -> URGENT notice when <= 1 day remains
//     stage 2 -> done for this trial
//
// In both cases the host keeps full access until the end date; expiry itself is
// enforced lazily on read (applyPendingCancellation) and by the client freeze gate.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const URGENT_DAYS = 3
const PAID_PLANS = ['starter', 'host', 'professional', 'business'] as const

// Canonical origin for the "Renew my plan" link — mirrors lib/auth.ts. Cron
// requests carry no reliable host header, so prefer the configured production URL.
function siteOrigin(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'https://www.stayknit.org'
}

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Refuse if the secret
  // is unset (so the endpoint can't be triggered before it's configured) or wrong.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET is not configured.' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
  const now = Date.now()
  const windowEnd = new Date(now + EXPIRY_REMINDER_DAYS * 86400000)
  const origin = siteOrigin()
  const renewUrl = `${origin}/?tab=plan`

  // Paid terms still active but ending within the reminder window, that haven't
  // completed both notices yet. Join the user for their email + name.
  const rows = await db
    .select({
      subId: subscription.id,
      userId: subscription.userId,
      plan: subscription.plan,
      cancelAt: subscription.cancelAt,
      stage: subscription.expiryNoticeStage,
      email: user.email,
      name: user.name,
    })
    .from(subscription)
    .innerJoin(user, eq(user.id, subscription.userId))
    .where(
      and(
        inArray(subscription.plan, PAID_PLANS as unknown as string[]),
        isNotNull(subscription.cancelAt),
        gt(subscription.cancelAt, new Date(now)),
        lte(subscription.cancelAt, windowEnd),
        lte(subscription.expiryNoticeStage, 1),
        // Hosts on auto-renewal are charged automatically — don't nudge them to
        // renew manually. They still keep access; the renewals cron handles them.
        eq(subscription.autoRenew, false),
      ),
    )

  let sent = 0
  const failures: string[] = []

  for (const row of rows) {
    if (!row.cancelAt || !isPaid(row.plan) || !row.email) continue
    const daysLeft = Math.ceil((new Date(row.cancelAt).getTime() - now) / 86400000)
    const urgent = daysLeft <= URGENT_DAYS

    // Which stage would this send advance us to? Skip if already sent.
    const targetStage = urgent ? 2 : 1
    if (row.stage >= targetStage) continue

    try {
      await sendSubscriptionExpiringEmail(row.email, {
        name: row.name || undefined,
        planName: planFor(row.plan).name,
        daysLeft,
        endsAt: new Date(row.cancelAt),
        renewUrl,
        urgent,
      })
      // Record progress only after a successful send, so a failed send retries
      // tomorrow rather than being silently skipped.
      await db
        .update(subscription)
        .set({ expiryNoticeStage: targetStage, updatedAt: new Date() })
        .where(eq(subscription.id, row.subId))
      sent++
    } catch (err) {
      console.error('[v0] expiry-reminder send failed for', row.email, err)
      failures.push(row.email)
    }
  }

  // --- Free trials ending soon --------------------------------------------
  // Live trials (plan = 'trial', trialEndsAt still in the future) ending within
  // the trial reminder window, that haven't completed both notices yet.
  const trialWindowEnd = new Date(now + TRIAL_REMINDER_DAYS * 86400000)
  const trialRows = await db
    .select({
      subId: subscription.id,
      trialEndsAt: subscription.trialEndsAt,
      stage: subscription.trialNoticeStage,
      email: user.email,
      name: user.name,
    })
    .from(subscription)
    .innerJoin(user, eq(user.id, subscription.userId))
    .where(
      and(
        eq(subscription.plan, 'trial'),
        isNotNull(subscription.trialEndsAt),
        gt(subscription.trialEndsAt, new Date(now)),
        lte(subscription.trialEndsAt, trialWindowEnd),
        lte(subscription.trialNoticeStage, 1),
      ),
    )

  for (const row of trialRows) {
    if (!row.trialEndsAt || !row.email) continue
    const daysLeft = Math.ceil((new Date(row.trialEndsAt).getTime() - now) / 86400000)
    const urgent = daysLeft <= TRIAL_URGENT_DAYS

    const targetStage = urgent ? 2 : 1
    if (row.stage >= targetStage) continue

    try {
      await sendTrialEndingEmail(row.email, {
        name: row.name || undefined,
        daysLeft,
        endsAt: new Date(row.trialEndsAt),
        plansUrl: renewUrl,
        urgent,
      })
      await db
        .update(subscription)
        .set({ trialNoticeStage: targetStage, updatedAt: new Date() })
        .where(eq(subscription.id, row.subId))
      sent++
    } catch (err) {
      console.error('[v0] trial-ending reminder send failed for', row.email, err)
      failures.push(row.email)
    }
  }

  // POPIA data-minimisation: purge profiles inactive for 12+ months. Runs here
  // on a guaranteed daily cadence (the lazy on-read sweep still catches
  // stragglers between runs). Best-effort — never fails the reminder run.
  let purged = false
  try {
    await sweepInactiveProfiles()
    purged = true
  } catch (err) {
    console.error('[v0] inactivity sweep failed', err)
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length + trialRows.length,
    sent,
    failed: failures.length,
    purged,
  })
  } catch (err) {
    await reportServerError('expiry-reminders cron', err)
    return NextResponse.json({ ok: false, error: 'Expiry reminders run failed.' }, { status: 500 })
  }
}
