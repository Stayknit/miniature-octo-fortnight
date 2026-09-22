import { NextResponse } from 'next/server'
import { and, eq, gt, inArray, isNotNull, lte, or, isNull, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { subscription, user } from '@/lib/db/schema'
import { chargeAuthorization } from '@/lib/paystack'
import { activatePlanFromReference } from '@/lib/billing/activate'
import { applyPriceOverrides, chargeCurrencyFor, periodPricing } from '@/lib/pricing'
import { getPriceOverrides } from '@/lib/billing/plan-prices'
import { isPaid, planFor } from '@/lib/plans'
import { reportServerError, sendOwnerAlertEmail, sendRenewalFailedEmail } from '@/lib/email'
import type { BillingPeriod, CurrencyCode } from '@/lib/types'
import { randomBytes } from 'crypto'

// Canonical origin for the "Renew my plan" link — mirrors the expiry cron.
function siteOrigin(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'https://www.stayknit.org'
}

// Runs daily (see vercel.json). Charges the saved card for hosts who OPTED INTO
// auto-renewal, shortly before their prepaid term ends, so their access never
// lapses. This is the only recurring-charge path in StayKnit; a host who never
// turned auto-renewal on is never touched here.
//
// Safety model:
//   - Only subs with autoRenew = true, a stored reusable authorization, status
//     'active', NOT self-cancelled, whose term ends within RENEW_LEAD_DAYS.
//   - renewalAttemptedAt throttles to at most one attempt per ~day, so a failed
//     charge retries tomorrow instead of hammering the card, and a slow
//     activation can't be double-charged in the same window.
//   - The actual grant goes through activatePlanFromReference (shared with
//     checkout + webhook), whose lastPaymentRef guard is idempotent and whose
//     stacking adds the new term ON TOP of remaining time — charging a couple of
//     days early never throws away paid days. A successful charge pushes cancelAt
//     out of the window and clears renewalAttemptedAt for the next cycle.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// How many days before term end to attempt the renewal charge.
const RENEW_LEAD_DAYS = 2
// Don't re-attempt within this window (guards same-day double charge / paces retries).
const RETRY_THROTTLE_MS = 20 * 60 * 60 * 1000 // 20h
const PAID_PLANS = ['starter', 'host', 'professional', 'business'] as const

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET is not configured.' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
  const now = Date.now()
  const windowEnd = new Date(now + RENEW_LEAD_DAYS * 86400000)
  const throttleCutoff = new Date(now - RETRY_THROTTLE_MS)

  const rows = await db
    .select({
      subId: subscription.id,
      userId: subscription.userId,
      plan: subscription.plan,
      period: subscription.billingPeriod,
      cancelAt: subscription.cancelAt,
      authCode: subscription.paystackAuthCode,
      currency: subscription.chargeCurrency,
      failCount: subscription.renewalFailureCount,
      email: user.email,
      name: user.name,
    })
    .from(subscription)
    .innerJoin(user, eq(user.id, subscription.userId))
    .where(
      and(
        eq(subscription.autoRenew, true),
        eq(subscription.status, 'active'),
        isNull(subscription.canceledAt),
        isNotNull(subscription.paystackAuthCode),
        inArray(subscription.plan, PAID_PLANS as unknown as string[]),
        isNotNull(subscription.cancelAt),
        gt(subscription.cancelAt, new Date(now)),
        lte(subscription.cancelAt, windowEnd),
        // Not attempted recently (null = never attempted this term).
        or(isNull(subscription.renewalAttemptedAt), lt(subscription.renewalAttemptedAt, throttleCutoff)),
      ),
    )

  const overrides = await getPriceOverrides()
  const origin = siteOrigin()
  const renewUrl = `${origin}/?tab=plan`
  let renewed = 0
  let charged = 0
  const failures: string[] = []

  for (const row of rows) {
    if (!row.authCode || !row.email || !isPaid(row.plan)) continue
    const period = (row.period as BillingPeriod) ?? 'yearly'
    const def = applyPriceOverrides(planFor(row.plan), overrides)
    // ZAR is the single billing currency. chargeCurrencyFor() already collapses
    // every stored value to ZAR, but we pass the stored value (or a ZAR default
    // when null/legacy) explicitly so a stray non-ZAR row can never cause the
    // amount and the charged currency to disagree — the amount is always
    // re-derived in the SAME currency we charge in.
    const currency = chargeCurrencyFor((row.currency as CurrencyCode) ?? ('zar' as CurrencyCode))
    const { totalCents } = periodPricing(def, currency, period)
    if (!totalCents) continue

    // Stamp the attempt BEFORE charging so a crash mid-charge still throttles
    // the retry rather than allowing a same-day repeat.
    await db
      .update(subscription)
      .set({ renewalAttemptedAt: new Date(), updatedAt: new Date() })
      .where(eq(subscription.id, row.subId))

    const reference = `SK-RENEW-${row.userId.slice(0, 8)}-${randomBytes(8).toString('hex')}`
    try {
      const res = await chargeAuthorization({
        email: row.email,
        amount: totalCents,
        currency: currency.toUpperCase(),
        reference,
        authorizationCode: row.authCode,
        metadata: { userId: row.userId, plan: row.plan, period, currency, autoRenew: true, renewal: true },
      })
      charged++
      // Paystack returns 'success' synchronously for an immediate card charge.
      // Activate straight away (the webhook is still the backstop if this races).
      if (res.status === 'success') {
        const result = await activatePlanFromReference(reference)
        if (result.ok) {
          renewed++
          // Clear any prior failure state now that the term renewed cleanly.
          if (row.failCount > 0) {
            await db
              .update(subscription)
              .set({ renewalFailureCount: 0, renewalFailedAt: null, updatedAt: new Date() })
              .where(eq(subscription.id, row.subId))
          }
        }
      } else {
        // Non-success status (e.g. 'failed'/'abandoned') is a soft failure —
        // treat it like a thrown error so the host is notified and we retry.
        throw new Error(`charge status: ${res.status}`)
      }
    } catch (err) {
      const message = (err as Error).message
      console.error('[v0] auto-renewal charge failed for', row.email, message)
      failures.push(row.email)

      // Track the failure so support can see stuck renewals and the copy can
      // escalate. renewalAttemptedAt (stamped above) still throttles retries.
      const attempt = (row.failCount ?? 0) + 1
      try {
        await db
          .update(subscription)
          .set({ renewalFailureCount: attempt, renewalFailedAt: new Date(), updatedAt: new Date() })
          .where(eq(subscription.id, row.subId))
      } catch (dbErr) {
        console.error('[v0] failed to record renewal failure for', row.email, dbErr)
      }

      // Notify the host (dunning) — their access hasn't lapsed yet, but they
      // should fix their card / renew manually. Best-effort.
      if (row.email) {
        try {
          await sendRenewalFailedEmail(row.email, {
            name: row.name || undefined,
            planName: planFor(row.plan).name,
            endsAt: row.cancelAt ? new Date(row.cancelAt) : new Date(),
            renewUrl,
            attempt,
          })
        } catch (mailErr) {
          console.error('[v0] renewal dunning email failed for', row.email, mailErr)
        }
      }

      // Alert the operator so a failing renewal is never silent.
      await sendOwnerAlertEmail('Auto-renewal charge failed', [
        `Host: ${row.email ?? row.userId}`,
        `Plan: ${row.plan}`,
        `Attempt: ${attempt}`,
        `Reason: ${message}`,
        `Term ends: ${row.cancelAt ? new Date(row.cancelAt).toISOString() : 'unknown'}`,
      ])
    }
  }

  // If a whole batch failed, make sure the operator sees the summary too.
  if (failures.length > 0 && failures.length === rows.length && rows.length > 1) {
    await sendOwnerAlertEmail('All auto-renewals failed today', [
      `Every one of today's ${rows.length} auto-renewal attempts failed.`,
      `This often means a billing/Paystack outage or a configuration problem.`,
    ])
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    charged,
    renewed,
    failed: failures.length,
  })
  } catch (err) {
    // Unexpected crash (DB, pricing, etc.) — alert the operator instead of
    // failing silently, then surface a 500 so Vercel marks the run failed.
    await reportServerError('renewals cron', err)
    return NextResponse.json({ ok: false, error: 'Renewals run failed.' }, { status: 500 })
  }
}
