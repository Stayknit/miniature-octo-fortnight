'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  account,
  booking,
  channel,
  costLine,
  feed,
  ownerClient,
  ownerInvite,
  promoRedemption,
  property,
  referral,
  refundRequest,
  securityQuestion,
  session,
  subscription,
  supportMessage,
  supportTicket,
  user,
  userSettings,
} from '@/lib/db/schema'
import { type CostKind, defaultCostLines, normalizeCostValue } from '@/lib/costing'
import { buildHost } from '@/lib/statement'
import { buildOwnerStatement } from '@/lib/owner-statement'
import { formatMoney } from '@/lib/currency'
import { draftSupportReply } from '@/lib/support-ai'
import { sendNewTicketAdminNotice, sendOwnerStatementEmail, sendTicketReceivedEmail } from '@/lib/email'
import { getCheckoutDiscountPct, redeemPromoCodeForUser, type RedeemResult } from '@/lib/promo'
import { channelFromUrl, isBlockSummary, normalizeIcalUrl, parseIcal } from '@/lib/ical'
import { assertSafeUrl, readCapped } from '@/lib/ssrf'
import { isPaid, isTrialExpired, periodFor, planFor, TRIAL_DAYS, unitCap } from '@/lib/plans'
import { applyPriceOverrides, applyPromoPct, chargeCurrencyFor, periodPricing } from '@/lib/pricing'
import { getPriceOverrides } from '@/lib/billing/plan-prices'

import { monthYearLabel, validateStayRange } from '@/lib/today'
import { initializeTransaction, refundTransaction, verifyTransaction } from '@/lib/paystack'
import { activatePlanFromReference } from '@/lib/billing/activate'
import { computeCancellationOutcome, noticeMonthsForPeriod } from '@/lib/billing/cancellation'
import { isTrialCardCaptureEnabled } from '@/lib/flags'
import type { BillingPeriod, IcalImportResult, OwnerData, PlanKey } from '@/lib/types'
import { randomBytes } from 'crypto'
import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const authSession = await auth.api.getSession({ headers: await headers() })
  if (!authSession?.user) throw new Error('Unauthorized')
  return authSession.user.id
}

// Transient conditions that a brief retry can clear, rather than 500-ing the
// request: a just-created parent row not yet visible to a FK insert (23503),
// and momentary connection failures from the pooled Postgres endpoint.
function isTransientDbError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  const code = e?.code
  if (code === '23503' || code === '57P01' || code === '08006' || code === '08003' || code === '53300') {
    return true
  }
  const msg = (e?.message ?? '').toLowerCase()
  return (
    msg.includes('econnreset') ||
    msg.includes('connection terminated') ||
    msg.includes('connection closed') ||
    msg.includes('too many clients') ||
    msg.includes('timeout')
  )
}

// Run a read/seed operation with a short exponential backoff on transient
// errors. Fixes the reproducible post-signup 500: the home page's first data
// fetch can race the visibility of the brand-new user row, so its FK-dependent
// seeding inserts (subscription/settings/cost lines) transiently fail. Each
// seed helper is SELECT-then-INSERT, so re-running the whole block is safe.
async function withDbRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransientDbError(err) || i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, 60 * (i + 1) * (i + 1))) // 60 / 240 / 540ms
    }
  }
  throw lastErr
}

// A profile untouched for this long is deleted automatically (~12 months).
const INACTIVITY_MS = 365 * 86400000

// Stamp the user as active now. Fire-and-forget from reads so a logged-in host
// keeps their profile alive; failures here must never break a page load.
async function touchActivity(userId: string) {
  try {
    await db.update(user).set({ lastActiveAt: new Date() }).where(eq(user.id, userId))
  } catch {
    // non-fatal — activity tracking is best-effort
  }
}

// Permanently erase every trace of a user: all app rows (plain userId scoping,
// no cascade) plus the auth rows. Deleting the user row cascades session and
// account, but we clear them first so nothing lingers if that ever changes.
//
// Wrapped in a single transaction so a POPIA erasure is all-or-nothing: a
// partial failure previously (Promise.all) could leave orphaned rows — e.g.
// bookings deleted but the subscription kept — which is both a data-integrity
// bug and a compliance one (the "right to be forgotten" half-honoured). If any
// delete throws, the whole thing rolls back and the caller sees the error.
async function purgeUserData(userId: string) {
  await db.transaction(async (tx) => {
    // supportMessage is keyed by ticketId (no userId), so clear the messages of
    // this user's tickets before the tickets themselves to avoid orphans.
    const ticketIds = await tx
      .select({ id: supportTicket.id })
      .from(supportTicket)
      .where(eq(supportTicket.userId, userId))
    if (ticketIds.length > 0) {
      await tx.delete(supportMessage).where(
        inArray(
          supportMessage.ticketId,
          ticketIds.map((t) => t.id),
        ),
      )
    }

    await Promise.all([
      tx.delete(property).where(eq(property.userId, userId)),
      tx.delete(booking).where(eq(booking.userId, userId)),
      tx.delete(feed).where(eq(feed.userId, userId)),
      tx.delete(channel).where(eq(channel.userId, userId)),
      tx.delete(subscription).where(eq(subscription.userId, userId)),
      tx.delete(userSettings).where(eq(userSettings.userId, userId)),
      tx.delete(ownerClient).where(eq(ownerClient.userId, userId)),
      tx.delete(ownerInvite).where(eq(ownerInvite.userId, userId)),
      tx.delete(referral).where(eq(referral.userId, userId)),
      tx.delete(supportTicket).where(eq(supportTicket.userId, userId)),
      tx.delete(promoRedemption).where(eq(promoRedemption.userId, userId)),
      tx.delete(costLine).where(eq(costLine.userId, userId)),
      tx.delete(securityQuestion).where(eq(securityQuestion.userId, userId)),
      tx.delete(session).where(eq(session.userId, userId)),
      tx.delete(account).where(eq(account.userId, userId)),
    ])
    // Cascades twoFactor/verification-by-user and any future FK-cascaded rows.
    await tx.delete(user).where(eq(user.id, userId))
  })
}

// Delete any profile inactive for 12+ months, along with all its data. Runs
// both on a daily cron (guaranteed cadence) and lazily on reads (catches
// stragglers between cron runs). Best-effort; batched to 25 per pass.
export async function sweepInactiveProfiles() {
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_MS)
    const stale = await db.select({ id: user.id }).from(user).where(lt(user.lastActiveAt, cutoff)).limit(25)
    for (const { id } of stale) await purgeUserData(id)
  } catch {
    // non-fatal — the next read will retry the sweep
  }
}

// Permanently delete the signed-in user's own profile and all associated data.
// Irreversible; the client signs out immediately afterwards. Linked owners
// cannot delete a host workspace — they only remove their own login.
export async function deleteProfile() {
  const userId = await getUserId()
  await purgeUserData(userId)
  return { ok: true }
}

type Workspace = {
  sessionUserId: string
  dataUserId: string // whose data to read/write (the host's id for linked owners)
  role: string
  isLinkedOwner: boolean
  email: string
  name: string
}

// Resolve whose workspace the signed-in user operates on. A host-created owner
// login carries `hostUserId`, so its reads/writes target the host's data (and
// its date requests land in the host's portal). Everyone else uses their own.
async function getWorkspace(): Promise<Workspace> {
  const authSession = await auth.api.getSession({ headers: await headers() })
  if (!authSession?.user) throw new Error('Unauthorized')
  const sessionUserId = authSession.user.id
  const [row] = await db.select().from(user).where(eq(user.id, sessionUserId)).limit(1)
  const role = row?.role ?? 'host'
  const hostUserId = row?.hostUserId ?? null
  const isLinkedOwner = role === 'owner' && !!hostUserId
  return {
    sessionUserId,
    dataUserId: isLinkedOwner ? (hostUserId as string) : sessionUserId,
    role,
    isLinkedOwner,
    email: (authSession.user.email ?? '').toLowerCase(),
    name: authSession.user.name ?? '',
  }
}

// Find the owner_client record for the signed-in user within a workspace.
// Linked owners match strictly by their login email so they can never see
// another owner's data; a host previewing their own portal falls back to the
// first record for the demo experience.
function matchOwnerSelf<T extends { email: string }>(owners: T[], ws: Workspace): T | null {
  const byEmail = owners.find((o) => o.email.toLowerCase() === ws.email) ?? null
  if (ws.isLinkedOwner) return byEmail
  return byEmail ?? owners[0] ?? null
}

// Ensure a subscription row exists — new hosts start on a 14-day free trial.
async function ensureSubscription(userId: string) {
  const existing = await db.select().from(subscription).where(eq(subscription.userId, userId)).limit(1)
  if (existing.length > 0) return applyPendingCancellation(existing[0])
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000)
  const inserted = await db
    .insert(subscription)
    .values({ userId, plan: 'trial', status: 'trialing', trialEndsAt })
    .returning()
  return inserted[0]
}

// When a prepaid term's access-end date (cancelAt) has passed, revert the host
// to the (expired) free trial before returning the row. Runs lazily on every
// read, so no cron job is needed to enforce the end date.
async function applyPendingCancellation(sub: typeof subscription.$inferSelect) {
  if (!sub.cancelAt || new Date(sub.cancelAt).getTime() > Date.now()) return sub
  const [updated] = await db
    .update(subscription)
    .set({
      plan: 'trial',
      billingPeriod: 'yearly',
      status: 'canceled',
      cancelAt: null,
      termEndsAt: null,
      canceledAt: null,
      foundingRate: false,
      updatedAt: new Date(),
    })
    .where(eq(subscription.userId, sub.userId))
    .returning()
  return updated
}

export type CancellationResult = {
  ok: boolean
  // Present when cancelling: when access is cut off after the notice period.
  accessUntil?: string
  noticeMonths?: number
  // A pro-rata refund of the unused balance has been requested and awaits owner
  // approval. Zero-refund cancellations (typical for monthly) omit these.
  refundPending?: boolean
  refundAmountCents?: number
  refundCurrency?: string
}

// Self-service plan cancellation / resume under the notice + pro-rata policy.
//
// Cancelling: the host keeps access through a NOTICE PERIOD (1 month monthly,
// 2 months yearly) from today, after which access reverts to the free trial —
// so cancelAt is pulled in from the full term end (termEndsAt) to the notice
// end. Any prepaid balance beyond the notice is refunded pro-rata; because that
// moves money, we don't call Paystack here — we create a PENDING refund_request
// for the platform owner to approve in the admin Payments area. Cancelling also
// switches OFF any opt-in auto-renewal and silences renewal reminders.
//
// Resuming (before the term's true end): restores access to the full paid term
// (cancelAt := termEndsAt), re-arms reminders, and WITHDRAWS any pending refund
// request (the host kept the plan, so no money moves). Auto-renewal stays off
// for the host to re-enable deliberately.
export async function setPlanCancellation(cancel: boolean): Promise<CancellationResult> {
  const userId = await getUserId()
  const [sub] = await db.select().from(subscription).where(eq(subscription.userId, userId)).limit(1)
  if (!sub) return { ok: false }
  // Only a live prepaid term (paid, active, with an access-end date) can be
  // cancelled or resumed. Trials and already-lapsed accounts have nothing to do.
  if (!isPaid(sub.plan) || sub.status !== 'active' || !sub.cancelAt) return { ok: false }

  // The true prepaid end. Legacy rows (activated before termEndsAt existed) fall
  // back to the current cancelAt.
  const termEndsAt = sub.termEndsAt ?? sub.cancelAt

  if (!cancel) {
    // Resume: restore full-term access and withdraw any pending refund request.
    await db
      .update(subscription)
      .set({ canceledAt: null, cancelAt: termEndsAt, expiryNoticeStage: 0, updatedAt: new Date() })
      .where(eq(subscription.userId, userId))
    await db
      .update(refundRequest)
      .set({ status: 'canceled', resolvedAt: new Date(), resolvedBy: 'host-resumed' })
      .where(and(eq(refundRequest.userId, userId), eq(refundRequest.status, 'pending')))
    revalidatePath('/')
    return { ok: true }
  }

  // Cancelling — compute notice end + pro-rata balance against the last charge.
  const now = new Date()
  const period = periodFor(sub.billingPeriod)
  const lastTermMonths = period.months + period.bonusMonths

  // The real amount paid on the last charge (discount-aware). If we can't verify
  // it, we still apply the notice-based cancellation but skip the refund request
  // rather than guess an amount — the owner can refund manually if warranted.
  let lastPaymentCents = 0
  let refundCurrency = (sub.chargeCurrency ?? 'zar').toUpperCase()
  if (sub.lastPaymentRef) {
    try {
      const tx = await verifyTransaction(sub.lastPaymentRef)
      if (tx && tx.status === 'success' && tx.amount > 0) {
        lastPaymentCents = tx.amount
        refundCurrency = tx.currency || refundCurrency
      }
    } catch (err) {
      console.error('[v0] verify for cancellation refund failed', err)
    }
  }

  const outcome = computeCancellationOutcome({
    now,
    termEndsAt: new Date(termEndsAt),
    lastPaymentCents,
    lastTermMonths,
    period: sub.billingPeriod,
  })

  await db
    .update(subscription)
    .set({
      canceledAt: now,
      // Access now ends at the notice period, not the full term.
      cancelAt: outcome.accessEndsAt,
      // Preserve the true term end for a later resume (backfills legacy nulls).
      termEndsAt,
      // Cancelling switches off auto-renewal so no further charge fires.
      autoRenew: false,
      // Silence renewal nudges while cancelled.
      expiryNoticeStage: 2,
      updatedAt: new Date(),
    })
    .where(eq(subscription.userId, userId))

  // Create a pending, owner-approved refund request for the unused balance.
  // Only when there's a real refundable amount and a transaction to refund, and
  // never a duplicate while one is already pending.
  let refundPending = false
  if (outcome.refundCents > 0 && sub.lastPaymentRef && lastPaymentCents > 0) {
    const [existing] = await db
      .select({ id: refundRequest.id })
      .from(refundRequest)
      .where(and(eq(refundRequest.userId, userId), eq(refundRequest.status, 'pending')))
      .limit(1)
    if (!existing) {
      await db.insert(refundRequest).values({
        userId,
        paymentRef: sub.lastPaymentRef,
        currency: refundCurrency,
        amountCents: outcome.refundCents,
        status: 'pending',
        note: `${planFor(sub.plan).name} · ${period.name} · ${outcome.noticeMonths}-month notice · access until ${outcome.accessEndsAt.toISOString().slice(0, 10)}`,
      })
    }
    refundPending = true
  }

  revalidatePath('/')
  return {
    ok: true,
    accessUntil: outcome.accessEndsAt.toISOString(),
    noticeMonths: outcome.noticeMonths,
    refundPending,
    refundAmountCents: refundPending ? outcome.refundCents : 0,
    refundCurrency,
  }
}

// Message shown when a host whose free trial has lapsed tries to act. Kept in
// one place so the UI freeze overlay and these server guards read the same.
const TRIAL_LAPSED_MESSAGE = 'Your free trial has ended. Subscribe to continue using StayKnit.'

// Server-side access gate — the authoritative counterpart to the client freeze
// overlay (isTrialExpired). Even if a host bypasses the UI and calls an action
// directly, workspace mutations are refused once the trial has lapsed. Reuses
// ensureSubscription so a lapsed prepaid term (which reverts to an expired
// trial) is enforced too. Reads, billing, support, and account export/delete
// intentionally stay open.
async function hasActiveAccess(userId: string): Promise<boolean> {
  const sub = await ensureSubscription(userId)
  return !isTrialExpired(sub)
}

// Throwing variant for actions whose contract is "resolve or throw".
async function assertActiveAccess(userId: string) {
  if (!(await hasActiveAccess(userId))) throw new Error(TRIAL_LAPSED_MESSAGE)
}

// User-facing promo/access code redemption. Any signed-in host can enter a code
// from the redemption bar; the heavy lifting (validation, cap enforcement,
// granting access) lives in redeemPromoCodeForUser so the same logic is reused
// everywhere. Revalidates so a granted term lifts the trial-expired freeze
// immediately.
export async function redeemCode(rawCode: string): Promise<RedeemResult> {
  const userId = await getUserId()
  const result = await redeemPromoCodeForUser(userId, rawCode)
  if (result.ok) revalidatePath('/')
  return result
}

// Ensure a settings row exists with sensible South-Africa defaults.
async function ensureSettings(userId: string) {
  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
  if (existing.length > 0) return existing[0]
  // Seed the statement business name from the name captured at sign-up so it
  // prints on owner statements immediately, without the host re-typing it. The
  // host can still change it in Settings; this is only the first-run default.
  const [u] = await db.select({ businessName: user.businessName }).from(user).where(eq(user.id, userId)).limit(1)
  // First page load for a new user fans out into several parallel requests that
  // all reach this insert. Without the conflict guard the losers of that race
  // violate user_settings_userId_key and crash the dashboard. onConflictDoNothing
  // makes the seed idempotent; whoever loses simply re-reads the winner's row.
  const inserted = await db
    .insert(userSettings)
    .values({ userId, businessName: (u?.businessName ?? "").trim() })
    .onConflictDoNothing({ target: userSettings.userId })
    .returning()
  if (inserted.length > 0) return inserted[0]
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
  return row
}

// Ensure the host has a set of default cost lines, seeding from their current
// commission setting so existing hosts keep their management percentage.
async function ensureCostLines(userId: string, managementPct: number) {
  const existing = await db.select().from(costLine).where(eq(costLine.userId, userId)).orderBy(asc(costLine.position))
  if (existing.length > 0) return existing
  // cost_line has no unique key on userId (a host has many lines), so the first
  // page load's parallel requests would each insert their own copy of the
  // default set, duplicating every line and corrupting statement math. Serialise
  // the seed behind a per-user transaction-scoped advisory lock and re-check once
  // we hold it, so exactly one caller seeds and the rest read the seeded rows.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    const again = await tx.select().from(costLine).where(eq(costLine.userId, userId)).orderBy(asc(costLine.position))
    if (again.length > 0) return again
    await tx.insert(costLine).values(defaultCostLines(managementPct).map((l, i) => ({ ...l, userId, position: i })))
    return tx.select().from(costLine).where(eq(costLine.userId, userId)).orderBy(asc(costLine.position))
  })
}

export async function getData() {
  const userId = await getUserId()
  // Best-effort maintenance, deferred until AFTER the response is sent. A raw
  // floating `void` promise gets torn down mid-query when the serverless
  // function freezes, which surfaced as spurious 503s on otherwise-successful
  // mutations (this runs on every revalidation). `after` is the platform-
  // supported way to keep the function alive for post-response work.
  after(async () => {
    await touchActivity(userId)
    // Belt-and-braces with the daily cron sweep: a small fraction of reads also
    // trigger a purge pass, clearing stragglers between cron runs without
    // running hundreds of deletes on every page load.
    if (Math.random() < 0.02) await sweepInactiveProfiles()
  })
  return withDbRetry(async () => {
    const [properties, channels, feeds, owners, bookings, sub, settings, referrals, checkoutDiscountPct] =
      await Promise.all([
        db.select().from(property).where(eq(property.userId, userId)).orderBy(asc(property.id)),
        db.select().from(channel).where(eq(channel.userId, userId)).orderBy(asc(channel.id)),
        db.select().from(feed).where(eq(feed.userId, userId)).orderBy(asc(feed.id)),
        db.select().from(ownerClient).where(eq(ownerClient.userId, userId)).orderBy(asc(ownerClient.id)),
        db.select().from(booking).where(eq(booking.userId, userId)).orderBy(asc(booking.checkIn)),
        ensureSubscription(userId),
        ensureSettings(userId),
        db.select().from(referral).where(eq(referral.userId, userId)).orderBy(desc(referral.createdAt)),
        getCheckoutDiscountPct(userId),
      ])
    const costLines = await ensureCostLines(userId, settings.commission)
    // StayKnit settles in ZAR only (see chargeCurrencyFor), so the price a host
    // sees IS the price Paystack charges — ZAR. Any foreign figure is only an
    // approximate conversion, never the billing source.
    const billingCurrency = 'zar' as const
    // Operator price overrides so in-app prices match what checkout charges.
    const priceOverrides = await getPriceOverrides()
    // Server-authoritative feature flag so the client only renders trial card
    // capture when it's deliberately enabled (see lib/flags).
    const trialCardCaptureEnabled = isTrialCardCaptureEnabled()
    return { properties, channels, feeds, owners, bookings, subscription: sub, settings, referrals, costLines, billingCurrency, priceOverrides, trialCardCaptureEnabled, checkoutDiscountPct }
  })
}

// --- Costing (host-wide default statement cost lines) ----------------------

export async function addCostLine() {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  const rows = await db.select({ position: costLine.position }).from(costLine).where(eq(costLine.userId, userId))
  const nextPos = rows.reduce((m, r) => Math.max(m, r.position), -1) + 1
  const inserted = await db
    .insert(costLine)
    .values({
      userId,
      position: nextPos,
      label: 'New cost',
      kind: 'fixed',
      value: 0,
      perBooking: false,
      enabled: true,
      propertyName: '',
      vatable: false,
    })
    .returning()
  revalidatePath('/')
  return inserted[0]
}

export async function updateCostLine(input: {
  id: number
  label: string
  kind: CostKind
  value: number
  perBooking: boolean
  enabled: boolean
  propertyName: string
  vatable: boolean
}) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  const kind: CostKind = input.kind === 'percent' ? 'percent' : 'fixed'
  await db
    .update(costLine)
    .set({
      label: input.label.trim().slice(0, 40) || 'Cost',
      kind,
      value: normalizeCostValue(kind, input.value),
      perBooking: kind === 'fixed' ? input.perBooking : false,
      enabled: input.enabled,
      propertyName: (input.propertyName ?? '').trim().slice(0, 80),
      vatable: Boolean(input.vatable),
      updatedAt: new Date(),
    })
    .where(and(eq(costLine.id, input.id), eq(costLine.userId, userId)))
  revalidatePath('/')
}

export async function deleteCostLine(id: number) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await db.delete(costLine).where(and(eq(costLine.id, id), eq(costLine.userId, userId)))
  revalidatePath('/')
}

// --- Billing / plans -------------------------------------------------------

export async function acceptTerms() {
  const userId = await getUserId()
  await ensureSubscription(userId)
  await db
    .update(subscription)
    .set({ termsAcceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(subscription.userId, userId))
  revalidatePath('/')
}

// Start a Paystack transaction for a paid plan, resumed by the inline popup.
// This is an upfront payment for the term, with longer terms rewarded by a
// discount (6-month) or bonus free months (1-year). Auto-renewal is opt-in: when
// `autoRenew` is true the host's card is saved (via the verified transaction) so
// the renewals cron can charge the same term again; when false nothing recurs.
// Only the plan KEY, period and the renew flag cross from the client — never a price
// or currency — so neither can be tampered with; the amount is built
// server-side from PLANS in the host's region currency and the transaction is
// initialized server-side, so the browser only ever receives an opaque access
// code. User id, plan, and period ride along in metadata so verification (in the
// confirm call and the webhook) can trust them.
export type StartCheckoutResult =
  | { ok: true; accessCode: string; reference: string }
  // `detail` carries the payment provider's own customer-safe reason (e.g.
  // "Currency not supported by merchant") when there is one, so the host and
  // support can see exactly why a charge could not start — not just the generic
  // line. Absent for configuration/transport failures with nothing safe to show.
  | { ok: false; error: string; detail?: string }

// Builds a short, human-readable Paystack reference that embeds the host's
// business (or personal) name, e.g. "SK-STAYKNIT-3d4d5e43" instead of an opaque
// "SK-1vf8bObe-…". Paystack references only allow [A-Za-z0-9-.=], so the name is
// stripped to alphanumerics, capped, and uppercased; a random suffix keeps every
// attempt unique. The reference is our end-to-end idempotency key, so a collision
// would only fail that retry — it can never double-grant a plan. Falls back to a
// slice of the userId when there's no usable name, so it stays traceable.
function buildPaymentReference(prefix: string, name: string | null | undefined, userId: string): string {
  const slug = (name ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 12)
    .toUpperCase()
  const suffix = randomBytes(4).toString('hex') // 8 hex chars (~4.3B combinations)
  return `${prefix}-${slug || userId.slice(0, 6)}-${suffix}`
}

export async function startPlanCheckout(
  plan: PlanKey,
  period: BillingPeriod,
  autoRenew = false,
): Promise<StartCheckoutResult> {
  // Resolve auth first and OUTSIDE the try below: an unauthenticated caller
  // should follow the normal auth redirect, not be masked as a payment error.
  const userId = await getUserId()

  try {
    // Resolve the tier with any operator price overrides so the charge reflects
    // the current dashboard-set fee (not the hardcoded default).
    const def = applyPriceOverrides(planFor(plan), await getPriceOverrides())
    if (!isPaid(plan) || !def.monthly) {
      return { ok: false, error: 'This plan is not billable.' }
    }

    // Paystack requires the payer's email; use the logged-in host's. Name and
    // business name feed the human-readable reference below.
    const [account] = await db
      .select({ email: user.email, name: user.name, businessName: user.businessName })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    if (!account?.email) {
      return { ok: false, error: 'Your account has no email on file. Add one in settings, then try again.' }
    }

    // StayKnit settles in ZAR only — the single billing source of truth — so the
    // charge currency is always ZAR regardless of where the host is. This removes
    // any currency arbitrage and keeps VAT cleanly ZAR-based for SARS. Paystack
    // expects the ISO code uppercased.
    const charged = chargeCurrencyFor('zar')
    // Upfront charge and access window are built server-side (so they can't be
    // spoofed): the monthly rate times paid months, less any term discount, with
    // accessMonths = paid + bonus free months.
    const { totalCents, accessMonths } = periodPricing(def, charged, period)
    if (!totalCents) return { ok: false, error: 'This plan is not billable.' }

    // Apply any discount the host holds, recomputed server-side from their own
    // redemptions so the charged amount can never be spoofed by the client. The
    // discount only reduces the price — access months are unchanged.
    const promoPct = await getCheckoutDiscountPct(userId)
    const chargeCents = applyPromoPct(totalCents, promoPct)
    if (chargeCents <= 0) {
      // A 100%-off (or otherwise invalid) discount can't be run through a card
      // charge — full comps are granted with "access" codes instead. Surface it
      // rather than silently free-granting a paid tier.
      console.error('[v0] startPlanCheckout zero charge from discount', { plan, period, promoPct })
      return { ok: false, error: 'Your discount covers the full amount — please contact support to activate this plan.' }
    }
    await ensureSubscription(userId)

    // Unique per attempt so retries never collide on Paystack's side; the
    // reference is also our activation idempotency key end-to-end.
    const reference = buildPaymentReference('SK', account.businessName || account.name, userId)

    const { accessCode } = await initializeTransaction({
      email: account.email,
      amount: chargeCents,
      currency: charged.toUpperCase(),
      reference,
      metadata: { userId, plan, period, currency: charged, accessMonths, promoPct, autoRenew: autoRenew === true },
    })

    return { ok: true, accessCode, reference }
  } catch (err) {
    // Log the TRUE cause server-side (missing key, Paystack decline, network)
    // so it's visible in logs/Sentry — then return a clean, actionable message.
    // Previously this threw, and in production the client rendered the raw
    // minified React digest ("Minified React error #441") to the host.
    const message = err instanceof Error ? err.message : String(err)
    console.error('[v0] startPlanCheckout failed', { plan, period, message })
    if (message.includes('PAYSTACK_SECRET_KEY')) {
      return { ok: false, error: 'Payments are not fully configured yet. Please try again shortly, or contact support.' }
    }
    if (message.startsWith('Paystack init failed')) {
      // Strip our prefix to reveal Paystack's own (customer-safe) reason so the
      // host/support can see the precise cause — currency not enabled, live not
      // activated, etc. — rather than a generic retry message.
      const reason = message.replace(/^Paystack init failed:\s*/, '').trim()
      return {
        ok: false,
        error: 'Our payment provider could not start this payment.',
        detail: reason && reason !== 'undefined' ? reason : undefined,
      }
    }
    return { ok: false, error: 'We could not start your payment. Please try again.' }
  }
}

// Toggle opt-in auto-renewal for the host's current live paid term. Turning it
// ON requires a saved card authorization (captured from a prior card payment);
// if none exists yet — e.g. the host paid by bank transfer — we report that so
// the UI can explain they must renew once by card to enable it. Turning it OFF
// stops all future auto-charges immediately; access is unaffected and runs to
// the end of the paid term either way.
export async function setAutoRenew(enabled: boolean): Promise<{ ok: boolean; reason?: 'no_card' | 'not_eligible' }> {
  const userId = await getUserId()
  const [sub] = await db.select().from(subscription).where(eq(subscription.userId, userId)).limit(1)
  if (!sub) return { ok: false, reason: 'not_eligible' }
  // Only a live paid term (active, with an access-end date) can carry renewal.
  if (!isPaid(sub.plan) || sub.status !== 'active' || !sub.cancelAt) {
    return { ok: false, reason: 'not_eligible' }
  }
  if (enabled && !sub.paystackAuthCode) return { ok: false, reason: 'no_card' }
  await db
    .update(subscription)
    .set({ autoRenew: enabled, updatedAt: new Date() })
    .where(eq(subscription.userId, userId))
  revalidatePath('/')
  return { ok: true }
}

// Confirm a completed Paystack transaction and activate the plan. Verifies the
// transaction with Paystack (never trusts the client) and requires the
// transaction's metadata userId to match the current session user before
// granting the paid plan. Idempotent and shared with the webhook path: if the
// webhook already activated this reference, this still reports success.
export async function confirmPlanCheckout(reference: string): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  const result = await activatePlanFromReference(reference, userId)
  if (result.ok) revalidatePath('/')
  return { ok: result.ok }
}

// --- Optional trial card capture -------------------------------------------
// Paystack South Africa can't tokenise a card for free, so "saving a card"
// means a tiny validation charge that we immediately refund. The R1 (100 ZAR
// cents) charge returns a reusable authorization we store as the card-on-file
// token; the host's net cost is zero. Gated behind isTrialCardCaptureEnabled()
// until the Terms card-on-file clause is counsel-approved.
const CARD_CAPTURE_AMOUNT_CENTS = 100 // R1.00 in ZAR minor units
// Verification guard: a card-capture transaction must never be more than this,
// so a tampered/replayed reference for a real plan payment can't be mistaken
// for a card capture and silently refunded.
const CARD_CAPTURE_MAX_CENTS = 200

// Begin trial card capture: initialise the R1 validation charge server-side and
// return the opaque access code for the inline popup. Amount/currency/metadata
// are all server-authoritative, exactly like startPlanCheckout.
export async function startTrialCardCapture(): Promise<{ accessCode: string; reference: string }> {
  if (!isTrialCardCaptureEnabled()) throw new Error('Card capture is not available')
  const userId = await getUserId()

  const [account] = await db
    .select({ email: user.email, name: user.name, businessName: user.businessName })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!account?.email) throw new Error('Your account has no email on file')

  await ensureSubscription(userId)
  // Nothing to do if a reusable card is already on file (e.g. from a prior paid
  // term) — avoid an unnecessary charge.
  const [sub] = await db
    .select({ authCode: subscription.paystackAuthCode })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1)
  if (sub?.authCode) throw new Error('A card is already saved for your account')

  const charged = chargeCurrencyFor('zar')
  const reference = buildPaymentReference('SKCARD', account.businessName || account.name, userId)
  const { accessCode } = await initializeTransaction({
    email: account.email,
    amount: CARD_CAPTURE_AMOUNT_CENTS,
    currency: charged.toUpperCase(),
    reference,
    // `kind` marks this as a card capture, NOT a plan payment: the activation
    // path ignores it (no `plan` in metadata) so the webhook can't grant a term.
    metadata: { userId, kind: 'card_capture' },
  })
  return { accessCode, reference }
}

export type CardCaptureResult = {
  ok: boolean
  reason?: 'disabled' | 'unverified' | 'not_a_card' | 'mismatch'
}

// Confirm trial card capture: verify the R1 charge, store the reusable card
// authorization, then refund the R1. Never trusts the client — the reference is
// re-verified with Paystack and must belong to this user and be a card-capture
// charge of the expected tiny amount. Does NOT enable auto-renew: saving a card
// and opting into recurring billing stay separate, deliberate choices.
export async function confirmTrialCardCapture(reference: string): Promise<CardCaptureResult> {
  if (!isTrialCardCaptureEnabled()) return { ok: false, reason: 'disabled' }
  const userId = await getUserId()

  const tx = await verifyTransaction(reference)
  if (!tx || tx.status !== 'success') return { ok: false, reason: 'unverified' }

  const meta = tx.metadata ?? {}
  // Must be a card-capture charge, for this user, of the expected tiny amount.
  if (meta.kind !== 'card_capture') return { ok: false, reason: 'mismatch' }
  if (typeof meta.userId !== 'string' || meta.userId !== userId) return { ok: false, reason: 'mismatch' }
  if (!(tx.amount > 0 && tx.amount <= CARD_CAPTURE_MAX_CENTS)) return { ok: false, reason: 'mismatch' }

  // Refund the validation charge regardless of the outcome below — the host
  // paid R1 and must get it back. Best-effort: a failed refund is logged but
  // never blocks saving the card (support can refund manually).
  const refund = await refundTransaction(reference)
  if (!refund.ok) {
    console.error('[v0] trial card-capture refund failed; refund manually', { reference })
  }

  // Only a reusable card yields a token we can charge later. If the host paid
  // the R1 by a non-reusable method, there's nothing to save — the refund above
  // still returns their money.
  if (!tx.reusable || !tx.authorizationCode) return { ok: false, reason: 'not_a_card' }

  await db
    .update(subscription)
    .set({
      paystackAuthCode: tx.authorizationCode,
      paystackCustomerCode: tx.customerCode,
      chargeCurrency: tx.currency.toLowerCase(),
      updatedAt: new Date(),
    })
    .where(eq(subscription.userId, userId))

  revalidatePath('/')
  return { ok: true }
}

// --- Settings --------------------------------------------------------------

export async function saveSettings(input: {
  pushNew: boolean
  pushClash: boolean
  pushCheckin: boolean
  mailDaily: boolean
  mailStatement: boolean
  autoAccept: boolean
  syncMinutes: number
  currency: string
  timezone: string
  businessName: string
  businessEmail: string
  businessPhone: string
}) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await ensureSettings(userId)
  await db
    .update(userSettings)
    .set({
      ...input,
      syncMinutes: Math.max(5, Math.round(input.syncMinutes) || 15),
      businessName: input.businessName.trim().slice(0, 80),
      businessEmail: input.businessEmail.trim().slice(0, 120),
      businessPhone: input.businessPhone.trim().slice(0, 40),
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, userId))
  revalidatePath('/')
}

// Persist the statement-costing config (default commission + VAT). These fields
// live exclusively on the Owners tab now, so this is the only writer for them —
// saveSettings no longer touches them, preventing a general settings save from
// clobbering values edited here.
export async function saveStatementConfig(input: {
  commission?: number
  vatEnabled?: boolean
  vatRate?: number
}) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await ensureSettings(userId)
  const patch: { updatedAt: Date; commission?: number; vatEnabled?: boolean; vatRate?: number } = {
    updatedAt: new Date(),
  }
  if (typeof input.commission === 'number') patch.commission = Math.min(100, Math.max(0, Math.round(input.commission) || 0))
  if (typeof input.vatEnabled === 'boolean') patch.vatEnabled = input.vatEnabled
  if (typeof input.vatRate === 'number') patch.vatRate = Math.min(100, Math.max(0, Math.round(input.vatRate) || 0))
  await db.update(userSettings).set(patch).where(eq(userSettings.userId, userId))
  revalidatePath('/')
}

// A readable temporary password for a host-created owner login.
function generatePassword(): string {
  return randomBytes(9).toString('base64url').replace(/[-_]/g, '') + 'A1'
}

// Host provisions a full login for an owner (email + temporary password). The
// account is linked to this host's workspace with role "owner", so it reads
// only its own units and its date requests appear in the host's portal. The
// host session is untouched — the user is created via the internal adapter
// rather than a sign-up that would swap the current session.
export async function createOwnerLogin(ownerId: number): Promise<{ email: string; password: string }> {
  const hostId = await getUserId()
  const [owner] = await db
    .select()
    .from(ownerClient)
    .where(and(eq(ownerClient.id, ownerId), eq(ownerClient.userId, hostId)))
    .limit(1)
  if (!owner) throw new Error('Owner not found')
  const email = owner.email.trim().toLowerCase()
  if (!email || !email.includes('@')) throw new Error('Add an email address for this owner first')
  await assertActiveAccess(hostId)

  const ctx = await auth.$context
  // The internal adapter's create/link helpers take an optional endpoint
  // "source" only used for validation we don't configure; cast to keep the
  // call sites clean.
  const internal = ctx.internalAdapter as unknown as {
    createUser: (u: Record<string, unknown>) => Promise<{ id: string }>
    linkAccount: (a: Record<string, unknown>) => Promise<unknown>
  }
  const password = generatePassword()
  const hashed = await ctx.password.hash(password)

  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (existing) {
    if (existing.id === hostId) throw new Error('That email is your own host login')
    // Link the existing account to this host and reset its password.
    await db.update(user).set({ role: 'owner', hostUserId: hostId }).where(eq(user.id, existing.id))
    const [cred] = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, existing.id), eq(account.providerId, 'credential')))
      .limit(1)
    if (cred) {
      await db.update(account).set({ password: hashed, updatedAt: new Date() }).where(eq(account.id, cred.id))
    } else {
      await internal.linkAccount({
        userId: existing.id,
        providerId: 'credential',
        accountId: existing.id,
        password: hashed,
      })
    }
  } else {
    const created = await internal.createUser({ email, name: owner.name || email, emailVerified: true })
    const newId = created?.id
    if (!newId) throw new Error('Could not create login')
    await db.update(user).set({ role: 'owner', hostUserId: hostId }).where(eq(user.id, newId))
    await internal.linkAccount({
      userId: newId,
      providerId: 'credential',
      accountId: newId,
      password: hashed,
    })
  }

  await db
    .update(ownerClient)
    .set({ hasAccess: true })
    .where(and(eq(ownerClient.id, ownerId), eq(ownerClient.userId, hostId)))
  revalidatePath('/')
  return { email, password }
}

// Host triggers a self-serve password reset email for one of their owners. The
// owner clicks the link and sets their own password — the host never sees it.
// Scoped to owners in the host's workspace so a host can't spray reset emails
// at arbitrary addresses. Returns the email so the UI can confirm where it went.
export async function sendOwnerPasswordReset(ownerId: number): Promise<{ email: string }> {
  const hostId = await getUserId()
  const [owner] = await db
    .select()
    .from(ownerClient)
    .where(and(eq(ownerClient.id, ownerId), eq(ownerClient.userId, hostId)))
    .limit(1)
  if (!owner) throw new Error('Owner not found')
  const email = owner.email.trim().toLowerCase()
  if (!email || !email.includes('@')) throw new Error('Add an email address for this owner first')

  await assertActiveAccess(hostId)
  // Only send if this owner actually has a login linked to this host, otherwise
  // there's nothing to reset — the host should use "Create login" instead.
  const [loginUser] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (!loginUser || loginUser.hostUserId !== hostId) throw new Error('This owner has no login yet — create one first')

  await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } })
  return { email }
}

// --- Referrals -------------------------------------------------------------

export async function sendReferral(email: string) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes('@')) throw new Error('Valid email required')
  const code = 'SK-' + randomBytes(4).toString('hex').toUpperCase()
  await db.insert(referral).values({ userId, email: clean, code, status: 'sent' })
  revalidatePath('/')
  return code
}

// --- Support ---------------------------------------------------------------

export async function submitSupportTicket(input: { category: string; subject: string; message: string }) {
  const userId = await getUserId()
  const message = input.message.trim()
  if (!message) throw new Error('Message required')
  const category = input.category || 'general'
  const subject = input.subject.trim()
  const [ticket] = await db
    .insert(supportTicket)
    .values({ userId, category, subject, message })
    .returning({ id: supportTicket.id })

  // AI is the first process on every ticket: draft a suggested reply from the
  // knowledge base into the ticket for the human agent to review. Deferred so a
  // slow model never delays the user's confirmation, and best-effort so a model
  // outage never loses the ticket.
  const [row] = await db
    .select({ name: user.name, role: user.role, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  after(async () => {
    try {
      const draft = await draftSupportReply({
        role: row?.role === 'owner' ? 'owner' : 'host',
        category,
        subject,
        message,
        userName: row?.name ?? undefined,
      })
      if (draft && ticket?.id) {
        await db.update(supportTicket).set({ aiDraft: draft }).where(eq(supportTicket.id, ticket.id))
      }
    } catch {
      // Best-effort; agent can regenerate from the dashboard.
    }

    // Notify the support inbox a ticket was raised, and acknowledge to the user.
    // Both are best-effort and independent so one failure can't block the other.
    if (row?.email) {
      try {
        await sendTicketReceivedEmail({ to: row.email, userName: row.name ?? undefined, subject, category, message })
      } catch {
        // best-effort
      }
    }
    try {
      await sendNewTicketAdminNotice({
        ticketId: ticket?.id ?? 0,
        userName: row?.name ?? undefined,
        userEmail: row?.email ?? 'unknown',
        category,
        subject,
        message,
      })
    } catch {
      // best-effort
    }
  })

  revalidatePath('/')
}

// Owner-scoped read. Returns ONLY the signed-in owner's own record plus the
// properties and bookings for their units — no other owner's data ever leaves
// the server in the payload.
export async function getOwnerData(): Promise<OwnerData> {
  const ws = await getWorkspace()
  const dataUserId = ws.dataUserId
  // Owner logins are real user rows too — stamp them active so an active owner
  // is never caught by the 12-month inactivity sweep. Deferred until after the
  // response (see getData for why a raw floating promise is unsafe here).
  after(() => touchActivity(ws.sessionUserId))

  return withDbRetry(async () => {
    const settings = await ensureSettings(dataUserId)
    const [hostRow] = await db.select().from(user).where(eq(user.id, dataUserId)).limit(1)
    const host = buildHost({
      hostName: hostRow?.name,
      hostEmail: hostRow?.email,
      businessName: settings.businessName,
      businessEmail: settings.businessEmail,
      businessPhone: settings.businessPhone,
    })

    const owners = await db
      .select()
      .from(ownerClient)
      .where(eq(ownerClient.userId, dataUserId))
      .orderBy(asc(ownerClient.id))

    const vat = { enabled: settings.vatEnabled, rate: settings.vatRate }

    const self = matchOwnerSelf(owners, ws)
    if (!self)
      return { self: null, properties: [], bookings: [], costLines: [], host, currency: settings.currency, vat }

    const units = new Set(self.units)
    const [allProps, allBookings, costLines] = await Promise.all([
      db.select().from(property).where(eq(property.userId, dataUserId)).orderBy(asc(property.id)),
      db.select().from(booking).where(eq(booking.userId, dataUserId)).orderBy(asc(booking.checkIn)),
      ensureCostLines(dataUserId, settings.commission),
    ])

    return {
      self,
      properties: allProps.filter((p) => units.has(p.name)),
      bookings: allBookings.filter((b) => units.has(b.propertyName)),
      costLines,
      host,
      currency: settings.currency,
      vat,
    }
  })
}

export async function addProperty(input: {
  name: string
  kind: string
  specs: string
  ownerName: string
  ownerEmail?: string
}) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  const name = input.name.trim()
  if (!name) throw new Error('Name required')
  const ownerName = input.ownerName.trim()

  // iCal feeds are connected separately in the Channels tab so a unit can carry
  // one feed per listing site, not a single shared link.
  await db.insert(property).values({
    userId,
    name,
    kind: input.kind || 'cottage',
    specs: input.specs.trim(),
    ownerName,
  })

  // Link the property to an owner client: attach to the existing record or
  // create a lightweight one so the unit shows up under the right owner.
  if (ownerName) {
    const existing = await db
      .select()
      .from(ownerClient)
      .where(and(eq(ownerClient.userId, userId), eq(ownerClient.name, ownerName)))
      .limit(1)
    if (existing.length > 0) {
      const o = existing[0]
      const units = o.units.includes(name) ? o.units : [...o.units, name]
      await db
        .update(ownerClient)
        .set({ units, email: o.email || (input.ownerEmail ?? '').trim() })
        .where(and(eq(ownerClient.id, o.id), eq(ownerClient.userId, userId)))
    } else {
      await db.insert(ownerClient).values({
        userId,
        name: ownerName,
        email: (input.ownerEmail ?? '').trim(),
        units: [name],
        hasAccess: false,
      })
    }
  }
  revalidatePath('/')
}

// Permanently remove a listing. Properties, bookings and feeds all link by unit
// NAME (there are no FKs on Neon), so deleting the property row alone would
// strand its bookings/feeds and leave the plan lock — which counts property
// rows — computing off a ghost. This deletes the row and, only when no other
// listing still carries the same name, its bookings and feeds too, then unlinks
// the name from every owner client. Scoped to the host throughout.
export async function removeProperty(propertyId: number): Promise<MutationResult> {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  const [row] = await db
    .select()
    .from(property)
    .where(and(eq(property.id, propertyId), eq(property.userId, userId)))
    .limit(1)
  if (!row) return { ok: false, error: 'Listing not found.' }
  const name = row.name

  await db.delete(property).where(and(eq(property.id, propertyId), eq(property.userId, userId)))

  // Guard against name collisions: if another listing still uses this name, its
  // bookings/feeds/owner-link must stay put.
  const stillNamed = await db
    .select({ id: property.id })
    .from(property)
    .where(and(eq(property.userId, userId), eq(property.name, name)))
    .limit(1)
  if (stillNamed.length === 0) {
    await db.delete(booking).where(and(eq(booking.userId, userId), eq(booking.propertyName, name)))
    await db.delete(feed).where(and(eq(feed.userId, userId), eq(feed.propertyName, name)))
    const owners = await db.select().from(ownerClient).where(eq(ownerClient.userId, userId))
    for (const o of owners) {
      if (o.units.includes(name)) {
        await db
          .update(ownerClient)
          .set({ units: o.units.filter((u) => u !== name) })
          .where(and(eq(ownerClient.id, o.id), eq(ownerClient.userId, userId)))
      }
    }
  }

  revalidatePath('/')
  return { ok: true }
}

export type MutationResult = { ok: true } | { ok: false; error: string }

export async function addDirectBooking(input: {
  propertyName: string
  guest: string
  checkIn: string
  checkOut: string
  amount: number
}): Promise<MutationResult> {
  const userId = await getUserId()
  if (!(await hasActiveAccess(userId))) return { ok: false, error: TRIAL_LAPSED_MESSAGE }
  if (!input.propertyName.trim()) return { ok: false, error: 'Choose a unit for this booking.' }
  // Defense in depth: never persist a stay that starts in the past or ends
  // before it begins, even if the client somehow submits one.
  const dateError = validateStayRange(input.checkIn, input.checkOut)
  if (dateError) return { ok: false, error: dateError }
  const nights = Math.max(
    1,
    Math.round((new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / 86400000),
  )
  await db.insert(booking).values({
    userId,
    propertyName: input.propertyName,
    guest: input.guest.trim() || 'Direct guest',
    channel: 'DIRECT',
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    amount: Math.max(0, Math.round(input.amount) || 0),
    status: 'confirmed',
    reason: 'StayKnit direct booking — blocks every linked channel',
  })
  revalidatePath('/')
  return { ok: true }
}

// Edit a host-created direct booking. Restricted to DIRECT bookings so
// channel/imported reservations stay read-only, and scoped to the host's own
// rows. Nights are recomputed from the new dates.
export async function updateDirectBooking(input: {
  id: number
  propertyName: string
  guest: string
  checkIn: string
  checkOut: string
  amount: number
}): Promise<MutationResult> {
  const userId = await getUserId()
  if (!(await hasActiveAccess(userId))) return { ok: false, error: TRIAL_LAPSED_MESSAGE }
  // Editing a historical stay is allowed (check-in may be in the past), but the
  // range must stay ordered — check-out always after check-in.
  if (input.checkOut <= input.checkIn) {
    return { ok: false, error: 'Check-out must be after check-in.' }
  }
  const nights = Math.max(
    1,
    Math.round((new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / 86400000),
  )
  await db
    .update(booking)
    .set({
      propertyName: input.propertyName,
      guest: input.guest.trim() || 'Direct guest',
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights,
      amount: Math.max(0, Math.round(input.amount) || 0),
    })
    .where(and(eq(booking.id, input.id), eq(booking.userId, userId), eq(booking.channel, 'DIRECT')))
  revalidatePath('/')
  return { ok: true }
}

// Remove a host-created direct booking (owner stay included). Restricted to
// DIRECT bookings so channel/imported reservations can't be deleted here.
export async function cancelDirectBooking(id: number) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await db
    .delete(booking)
    .where(and(eq(booking.id, id), eq(booking.userId, userId), eq(booking.channel, 'DIRECT')))
  revalidatePath('/')
}

// Set the price on an imported (channel) booking. iCal feeds never carry the
// payout, so the host enters it here and it flows into statements, payouts and
// revenue. Deliberately NOT restricted to DIRECT — this is the one amount edit
// allowed on channel/imported reservations. Dates, guest and status stay
// read-only (owned by the feed), and re-sync never overwrites amount, so the
// entered price survives every future import. Blocks (status 'block') carry no
// money and are excluded.
export async function setBookingPrice(id: number, amount: number): Promise<MutationResult> {
  const userId = await getUserId()
  if (!(await hasActiveAccess(userId))) return { ok: false, error: TRIAL_LAPSED_MESSAGE }
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'Enter a valid amount.' }
  await db
    .update(booking)
    .set({ amount: Math.max(0, Math.round(amount)) })
    .where(and(eq(booking.id, id), eq(booking.userId, userId), ne(booking.status, 'block')))
  revalidatePath('/')
  return { ok: true }
}

// Host marks (or unmarks) whether a booking's owner payment was processed.
// Scoped to the host's own bookings; owners never call this.
export async function setBookingPaid(id: number, paid: boolean) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await db
    .update(booking)
    .set({ paid })
    .where(and(eq(booking.id, id), eq(booking.userId, userId)))
  revalidatePath('/')
}

// Connect an iCal feed to a property for one listing site. A property can hold
// many feeds (Airbnb, Booking.com, …); each is a separate row so none overwrite
// each other. Re-adding the exact same URL for a property is a no-op.
export async function addFeed(input: { propertyName: string; channel?: string; icalUrl: string }) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  const name = input.propertyName.trim()
  const url = input.icalUrl.trim()
  if (!name || !url) throw new Error('Property and iCal URL required')

  const label = (input.channel ?? '').trim() || channelFromUrl(url)

  const dup = await db
    .select({ id: feed.id })
    .from(feed)
    .where(and(eq(feed.userId, userId), eq(feed.propertyName, name), eq(feed.icalUrl, url)))
    .limit(1)
  if (dup.length === 0) {
    await db.insert(feed).values({ userId, propertyName: name, channel: label, icalUrl: url })
  }
  revalidatePath('/')
}

// Edit a single iCal feed's property, listing-site label, or export URL.
// Scoped to the host's own feeds.
export async function updateFeed(input: { id: number; propertyName: string; channel?: string; icalUrl: string }) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  const name = input.propertyName.trim()
  const url = input.icalUrl.trim()
  if (!name || !url) throw new Error('Property and iCal URL required')
  const label = (input.channel ?? '').trim() || channelFromUrl(url)
  await db
    .update(feed)
    .set({ propertyName: name, channel: label, icalUrl: url })
    .where(and(eq(feed.id, input.id), eq(feed.userId, userId)))
  revalidatePath('/')
}

// Disconnect a single iCal feed. Scoped to the host's own feeds.
export async function removeFeed(id: number) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await db.delete(feed).where(and(eq(feed.id, id), eq(feed.userId, userId)))
  revalidatePath('/')
}

// Stable identity for an iCal event: prefer the VEVENT UID (survives date
// changes), fall back to the date range when a feed omits UIDs.
function eventIdentity(ev: { uid?: string; start: string; end: string }): string {
  const uid = (ev.uid ?? '').trim()
  return uid ? `uid:${uid}` : `dt:${ev.start}|${ev.end}`
}

function nightsBetween(start: string, end: string): number {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000))
}

// Pull availability from every property's iCal feed and RECONCILE it into the
// unified calendar. For each feed that fetches successfully we insert new
// reservations, update ones whose dates changed, and remove ones that have
// disappeared from the feed (i.e. cancellations) — so a stale block can no
// longer sit on the calendar forever and cause lost bookings.
//
// Safety: reconciliation (including deletion) happens ONLY for a feed that was
// fetched and parsed successfully. A feed that is unreachable, times out, or
// errors is reported and skipped, and its previously-imported rows are left
// untouched — an outage must never wipe blocks and open the door to double
// bookings. Manual/direct bookings and manually-added blocks (no sourceFeedId)
// are never modified or deleted.
export async function importIcalFeeds(): Promise<IcalImportResult> {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  return syncFeedsForUser(userId, { onlyDue: false })
}

// Normal re-sync cadence for a healthy feed, and the exponential backoff bounds
// applied after a failure so a permanently-broken feed doesn't get hammered.
const FEED_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000 // 3 hours
const FEED_RETRY_BASE_MS = 30 * 60 * 1000 // 30 minutes
const FEED_RETRY_MAX_MS = 24 * 60 * 60 * 1000 // capped at 24 hours

function feedBackoffMs(failureCount: number): number {
  return Math.min(FEED_RETRY_BASE_MS * 2 ** Math.max(0, failureCount - 1), FEED_RETRY_MAX_MS)
}

// Core iCal reconciliation shared by the manual "Sync now" action and the
// scheduled background cron. Records per-feed sync health (status, last error,
// failure count, next retry) so the UI can show it and the cron can back off.
// `onlyDue` (used by the cron) skips feeds whose backoff window hasn't elapsed.
export async function syncFeedsForUser(
  userId: string,
  opts: { onlyDue?: boolean; skipIfNoAccess?: boolean } = {},
): Promise<IcalImportResult> {
  const props = await db.select().from(property).where(eq(property.userId, userId)).orderBy(asc(property.id))
  const allFeeds = await db.select().from(feed).where(eq(feed.userId, userId)).orderBy(asc(feed.id))

  // On the free trial only the first N units may sync live; the rest are locked
  // until the host upgrades. Paid plans lift the cap entirely. The cap counts
  // units (properties), not feeds — a unit may carry several feeds.
  const sub = await ensureSubscription(userId)
  // The background cron passes skipIfNoAccess so it never syncs (or charges the
  // fetch budget for) an account whose trial/subscription has lapsed. The manual
  // action asserts access before calling, so it never sets this.
  if (opts.skipIfNoAccess && isTrialExpired(sub)) {
    return { feeds: 0, reachable: 0, imported: 0, updated: 0, removed: 0, skipped: 0, locked: 0, errors: [] }
  }
  const cap = unitCap(sub)
  const allowed = new Set(props.slice(0, cap).map((p) => p.name))
  const now = new Date()
  let feeds = allFeeds.filter((f) => allowed.has(f.propertyName))
  // The scheduled cron only touches feeds that are actually due (respecting
  // per-feed backoff); the manual action always syncs everything.
  if (opts.onlyDue) {
    feeds = feeds.filter((f) => !f.nextRetryAt || f.nextRetryAt.getTime() <= now.getTime())
  }
  const locked = allFeeds.length - feeds.length

  // Per-feed health updates collected during the run, applied at the end.
  const feedStatus: { id: number; set: Partial<typeof feed.$inferInsert> }[] = []
  const markOk = (f: (typeof feeds)[number]) =>
    feedStatus.push({
      id: f.id,
      set: {
        lastAttemptAt: now,
        lastSyncedAt: now,
        lastStatus: 'ok',
        lastError: null,
        failureCount: 0,
        nextRetryAt: new Date(now.getTime() + FEED_SYNC_INTERVAL_MS),
      },
    })
  const markError = (f: (typeof feeds)[number], reason: string) => {
    const fc = (f.failureCount ?? 0) + 1
    feedStatus.push({
      id: f.id,
      set: {
        lastAttemptAt: now,
        lastStatus: 'error',
        lastError: reason.slice(0, 200),
        failureCount: fc,
        nextRetryAt: new Date(now.getTime() + feedBackoffMs(fc)),
      },
    })
  }

  const existing = await db.select().from(booking).where(eq(booking.userId, userId))
  // Legacy rows imported before reconciliation existed carry no sourceFeedId.
  // We adopt them by date match on first sync so nothing duplicates.
  const legacyImported = existing.filter((b) => b.sourceFeedId == null && b.reason === 'Imported from iCal')
  // Guard against inserting a duplicate block when the same stay is exposed by
  // more than one connected feed for a property (preserves prior UX).
  const globalDateKeys = new Set(existing.map((b) => `${b.propertyName}|${b.checkIn}|${b.checkOut}`))
  const usedLegacyIds = new Set<number>()

  const result: IcalImportResult = {
    feeds: feeds.length,
    reachable: 0,
    imported: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
    locked,
    errors: [],
  }
  const toInsert: (typeof booking.$inferInsert)[] = []
  const toUpdate: { id: number; checkIn: string; checkOut: string; nights: number; guest: string; channel: string; status: string }[] = []
  const toAdopt: { id: number; sourceUid: string; sourceFeedId: number }[] = []
  const toDelete: number[] = []

  for (const f of feeds) {
    const label = f.channel || f.propertyName
    const url = normalizeIcalUrl(f.icalUrl)
    if (!url) {
      result.errors.push(`${f.propertyName} (${label}): invalid URL`)
      markError(f, 'invalid feed URL')
      continue
    }
    // SSRF guard: only fetch public http(s) hosts, never internal/metadata IPs.
    try {
      await assertSafeUrl(url)
    } catch {
      result.errors.push(`${f.propertyName} (${label}): feed URL not allowed`)
      markError(f, 'feed URL not allowed')
      continue
    }

    let text: string
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'StayKnit-iCal/1.0', Accept: 'text/calendar,*/*' },
        cache: 'no-store',
        redirect: 'error', // a redirect could bounce us to an internal host
      })
      clearTimeout(timer)
      if (!res.ok) {
        result.errors.push(`${f.propertyName} (${label}): feed returned ${res.status}`)
        markError(f, `feed returned ${res.status}`)
        continue
      }
      // Cap the download at 5 MB — real iCal feeds are far smaller.
      text = await readCapped(res, 5 * 1024 * 1024)
    } catch {
      result.errors.push(`${f.propertyName} (${label}): feed unreachable`)
      markError(f, 'feed unreachable')
      continue
    }

    // Fetched OK — this feed is now safe to reconcile.
    result.reachable++
    const ch = f.channel ? f.channel.toUpperCase() : channelFromUrl(url)

    // Rows this feed currently owns, keyed by their stored identity.
    const feedRows = existing.filter((b) => b.sourceFeedId === f.id)
    const rowByIdentity = new Map(feedRows.map((b) => [b.sourceUid ?? `dt:${b.checkIn}|${b.checkOut}`, b]))
    const currentIdentities = new Set<string>()

    for (const ev of parseIcal(text)) {
      if (!ev.start || !ev.end) continue
      // A cancelled reservation. Most OTAs drop the VEVENT on cancel (handled by
      // the reconciliation loop below), but some keep it with STATUS:CANCELLED.
      // Treat that as absent — skip before recording its identity — so any row
      // this feed still owns for it is deleted and the date frees up, instead of
      // lingering as a confirmed stay blocking availability that is actually open.
      if (ev.status === 'CANCELLED') continue
      const identity = eventIdentity(ev)
      currentIdentities.add(identity)
      const blocked = isBlockSummary(ev.summary)
      const guest = blocked ? 'Blocked' : ev.summary || 'Imported stay'
      const chan = blocked ? 'BLOCK' : ch
      const status = blocked ? 'block' : 'confirmed'
      const nights = nightsBetween(ev.start, ev.end)

      const match = rowByIdentity.get(identity)
      if (match) {
        // Known reservation: update if the source moved its dates.
        if (match.checkIn !== ev.start || match.checkOut !== ev.end) {
          globalDateKeys.delete(`${f.propertyName}|${match.checkIn}|${match.checkOut}`)
          globalDateKeys.add(`${f.propertyName}|${ev.start}|${ev.end}`)
          toUpdate.push({ id: match.id, checkIn: ev.start, checkOut: ev.end, nights, guest, channel: chan, status })
          result.updated++
        } else {
          result.skipped++
        }
        continue
      }

      // New to this feed: adopt a matching legacy (pre-reconciliation) row so
      // the first sync links instead of duplicating.
      const legacy = legacyImported.find(
        (b) =>
          !usedLegacyIds.has(b.id) &&
          b.propertyName === f.propertyName &&
          b.checkIn === ev.start &&
          b.checkOut === ev.end,
      )
      if (legacy) {
        usedLegacyIds.add(legacy.id)
        toAdopt.push({ id: legacy.id, sourceUid: identity, sourceFeedId: f.id })
        result.skipped++
        continue
      }

      // Another connected feed already covers these exact dates — don't double it.
      const dk = `${f.propertyName}|${ev.start}|${ev.end}`
      if (globalDateKeys.has(dk)) {
        result.skipped++
        continue
      }
      globalDateKeys.add(dk)
      toInsert.push({
        userId,
        propertyName: f.propertyName,
        guest,
        channel: chan,
        checkIn: ev.start,
        checkOut: ev.end,
        nights,
        amount: 0,
        status,
        reason: 'Imported from iCal',
        sourceUid: identity,
        sourceFeedId: f.id,
      })
      result.imported++
    }

    // Cancellations: rows this feed owned that the feed no longer lists.
    for (const b of feedRows) {
      const identity = b.sourceUid ?? `dt:${b.checkIn}|${b.checkOut}`
      if (!currentIdentities.has(identity)) {
        toDelete.push(b.id)
        result.removed++
      }
    }

    // Reconciled cleanly — record a healthy sync and schedule the next one.
    markOk(f)
  }

  // Persist per-feed sync health regardless of booking changes.
  for (const s of feedStatus) {
    await db.update(feed).set(s.set).where(and(eq(feed.id, s.id), eq(feed.userId, userId)))
  }

  // onConflictDoNothing on the (sourceFeedId, sourceUid) unique index makes a
  // concurrent re-sync a no-op for rows another run already inserted, instead of
  // throwing — the app-level dedupe handles the common case, this closes the race.
  if (toInsert.length > 0)
    await db
      .insert(booking)
      .values(toInsert)
      .onConflictDoNothing({ target: [booking.sourceFeedId, booking.sourceUid] })
  for (const u of toUpdate) {
    await db
      .update(booking)
      .set({ checkIn: u.checkIn, checkOut: u.checkOut, nights: u.nights, guest: u.guest, channel: u.channel, status: u.status })
      .where(and(eq(booking.id, u.id), eq(booking.userId, userId)))
  }
  for (const a of toAdopt) {
    await db
      .update(booking)
      .set({ sourceUid: a.sourceUid, sourceFeedId: a.sourceFeedId })
      .where(and(eq(booking.id, a.id), eq(booking.userId, userId)))
  }
  if (toDelete.length > 0) {
    await db.delete(booking).where(and(inArray(booking.id, toDelete), eq(booking.userId, userId)))
  }
  revalidatePath('/')
  return result
}

export async function addBlock(input: {
  propertyName: string
  checkIn: string
  checkOut: string
  reason: string
}): Promise<MutationResult> {
  const userId = await getUserId()
  if (!(await hasActiveAccess(userId))) return { ok: false, error: TRIAL_LAPSED_MESSAGE }
  if (!input.propertyName.trim()) return { ok: false, error: 'Choose a unit to block.' }
  // A block that lands in the past silently leaves real future availability
  // unprotected — a genuine double-booking risk — so reject past-dated ranges.
  const dateError = validateStayRange(input.checkIn, input.checkOut)
  if (dateError) return { ok: false, error: dateError }
  const nights = Math.max(
    1,
    Math.round((new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / 86400000),
  )
  await db.insert(booking).values({
    userId,
    propertyName: input.propertyName,
    guest: 'Blocked',
    channel: 'BLOCK',
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    amount: 0,
    status: 'block',
    reason: input.reason.trim(),
  })
  revalidatePath('/')
  return { ok: true }
}

// --- Outgoing iCal feed (publish StayKnit-origin holds to the OTAs) --------
// The token is the unit's only feed credential; it maps to exactly one unit at
// /ical/<token>.ics. A url-safe 24-byte secret (32 chars) — comfortably above
// the route's minimum-length guard and infeasible to guess.
function newFeedToken() {
  return randomBytes(24).toString('base64url')
}

// Enable publishing for a unit: mint a token if it doesn't already have one.
// Idempotent — returns the existing token if the feed is already on.
export async function enablePropertyFeed(propertyId: number): Promise<{ ok: boolean; token?: string; error?: string }> {
  const userId = await getUserId()
  if (!(await hasActiveAccess(userId))) return { ok: false, error: TRIAL_LAPSED_MESSAGE }
  const [row] = await db
    .select()
    .from(property)
    .where(and(eq(property.id, propertyId), eq(property.userId, userId)))
    .limit(1)
  if (!row) return { ok: false, error: 'Unit not found.' }
  if (row.icalFeedToken) return { ok: true, token: row.icalFeedToken }
  const token = newFeedToken()
  await db
    .update(property)
    .set({ icalFeedToken: token })
    .where(and(eq(property.id, propertyId), eq(property.userId, userId)))
  revalidatePath('/')
  return { ok: true, token }
}

// Rotate the token — instantly kills the old URL wherever it was pasted. Used
// if a feed URL leaks or the host wants to revoke a stale subscription.
export async function regeneratePropertyFeed(propertyId: number): Promise<{ ok: boolean; token?: string; error?: string }> {
  const userId = await getUserId()
  if (!(await hasActiveAccess(userId))) return { ok: false, error: TRIAL_LAPSED_MESSAGE }
  const token = newFeedToken()
  const updated = await db
    .update(property)
    .set({ icalFeedToken: token })
    .where(and(eq(property.id, propertyId), eq(property.userId, userId)))
    .returning({ id: property.id })
  if (updated.length === 0) return { ok: false, error: 'Unit not found.' }
  revalidatePath('/')
  return { ok: true, token }
}

// Stop publishing entirely: clear the token so the URL 404s. Always allowed,
// even on a lapsed trial, so a host can always kill a live feed.
export async function disablePropertyFeed(propertyId: number): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  await db
    .update(property)
    .set({ icalFeedToken: null })
    .where(and(eq(property.id, propertyId), eq(property.userId, userId)))
  revalidatePath('/')
  return { ok: true }
}

export async function acknowledgeBooking(id: number) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await db
    .update(booking)
    .set({ status: 'confirmed' })
    .where(and(eq(booking.id, id), eq(booking.userId, userId)))
  revalidatePath('/')
}

export async function toggleChannel(id: number, live: boolean) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await db.update(channel).set({ live }).where(and(eq(channel.id, id), eq(channel.userId, userId)))
  revalidatePath('/')
}

// Rename a linked listing site. Scoped to the host's own channels. The number
// of units linked and the sync status are DERIVED from the real iCal feeds
// (feed.channel === channel.name), not stored here, so neither is editable.
export async function updateChannel(input: { id: number; name: string }) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  const name = input.name.trim()
  if (!name) throw new Error('Channel name required')
  await db
    .update(channel)
    .set({ name })
    .where(and(eq(channel.id, input.id), eq(channel.userId, userId)))
  revalidatePath('/')
}

// Remove a linked listing site entirely. Scoped to the host's own channels.
export async function removeChannel(id: number) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await db.delete(channel).where(and(eq(channel.id, id), eq(channel.userId, userId)))
  revalidatePath('/')
}

export async function addOwner(input: { name: string; email: string; units: string }) {
  const userId = await getUserId()
  const name = input.name.trim()
  if (!name) throw new Error('Name required')
  const units = input.units
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  await assertActiveAccess(userId)
  await db.insert(ownerClient).values({
    userId,
    name,
    email: input.email.trim(),
    units: units.length ? units : ['New unit'],
    hasAccess: false,
  })
  revalidatePath('/')
}

export async function updateOwner(input: { id: number; name: string; email: string; units: string }) {
  const userId = await getUserId()
  const name = input.name.trim()
  if (!name) throw new Error('Name required')
  const units = input.units
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  await assertActiveAccess(userId)
  await db
    .update(ownerClient)
    .set({ name, email: input.email.trim(), units: units.length ? units : ['New unit'] })
    .where(and(eq(ownerClient.id, input.id), eq(ownerClient.userId, userId)))
  revalidatePath('/')
}

export async function toggleOwnerAccess(id: number, hasAccess: boolean) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  // Turning access ON must reflect a real linked login. Without this guard the
  // flag can read "access granted" while no owner account exists — the exact
  // mismatch that left an owner stranded on a separate host account. Disabling
  // is always allowed (revokes a login's view). Enabling requires that a user
  // row with role "owner" is linked to this host by the owner's email.
  if (hasAccess) {
    const [owner] = await db
      .select()
      .from(ownerClient)
      .where(and(eq(ownerClient.id, id), eq(ownerClient.userId, userId)))
      .limit(1)
    if (!owner) throw new Error('Owner not found')
    const email = owner.email.trim().toLowerCase()
    const [loginUser] = email ? await db.select().from(user).where(eq(user.email, email)).limit(1) : []
    if (!loginUser || loginUser.hostUserId !== userId || loginUser.role !== 'owner') {
      throw new Error('This owner has no linked login yet — use "Create login" first')
    }
  }
  await db.update(ownerClient).set({ hasAccess }).where(and(eq(ownerClient.id, id), eq(ownerClient.userId, userId)))
  revalidatePath('/')
}

export async function deleteOwner(id: number) {
  const userId = await getUserId()
  await assertActiveAccess(userId)
  await db.delete(ownerClient).where(and(eq(ownerClient.id, id), eq(ownerClient.userId, userId)))
  revalidatePath('/')
}

// Email the signed-in HOST a filed copy of an owner's current payout statement.
// Owners view their own statements in the in-app portal; this sends the host's
// own records copy to the host's login email (real server send via SMTP, not a
// mailto draft). Figures are built from the same canonical builder the in-app
// statement uses, so the emailed copy always matches what the host sees.
export async function emailStatementToHost(ownerId: number): Promise<{ ok: boolean; to: string }> {
  const userId = await getUserId()
  await assertActiveAccess(userId)

  const authSession = await auth.api.getSession({ headers: await headers() })
  const hostEmail = (authSession?.user?.email ?? '').toLowerCase()
  const hostName = authSession?.user?.name ?? ''
  if (!hostEmail) throw new Error('No email is on file for your account.')

  const [owner] = await db
    .select()
    .from(ownerClient)
    .where(and(eq(ownerClient.id, ownerId), eq(ownerClient.userId, userId)))
    .limit(1)
  if (!owner) throw new Error('Owner not found.')

  const [bookings, settings] = await Promise.all([
    db.select().from(booking).where(eq(booking.userId, userId)).orderBy(asc(booking.checkIn)),
    ensureSettings(userId),
  ])
  const costLines = await ensureCostLines(userId, settings.commission)

  const host = buildHost({
    hostName,
    hostEmail,
    businessName: settings.businessName,
    businessEmail: settings.businessEmail,
    businessPhone: settings.businessPhone,
  })
  const statement = buildOwnerStatement({
    self: owner,
    bookings,
    costLines,
    vat: { enabled: settings.vatEnabled, rate: settings.vatRate },
    currency: settings.currency,
    host,
  })
  if (!statement) throw new Error('Could not build a statement for this owner.')

  const cur = settings.currency
  const rows = [
    { label: 'Nights booked', value: String(statement.nights) },
    { label: 'Gross revenue', value: formatMoney(statement.gross, cur) },
    ...statement.lines.map((l) => ({ label: l.label, value: `− ${formatMoney(l.amount, cur)}`, muted: true })),
    { label: 'Net payout', value: formatMoney(statement.net, cur), strong: true },
    ...(statement.paid !== undefined ? [{ label: 'Paid to date', value: formatMoney(statement.paid, cur), muted: true }] : []),
    ...(statement.due !== undefined ? [{ label: 'Outstanding due', value: formatMoney(statement.due, cur) }] : []),
  ]

  await sendOwnerStatementEmail({
    to: hostEmail,
    hostName,
    ownerName: statement.name,
    ownerEmail: statement.email,
    period: monthYearLabel(),
    property: statement.property,
    rows,
  })

  return { ok: true, to: hostEmail }
}

// Self-service data export (report #13) — backs the in-app promise that you can
// "export or delete your data at any time". Returns every record scoped to the
// signed-in account as a plain, download-ready object. Read-only: no side
// effects, and the password hash / security-question answers are never
// included. Owners can export their own account row too.
export async function exportMyData() {
  const userId = await getUserId()
  const [me] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  const [properties, feeds, channels, bookings, owners, costLines, referrals, tickets, settingsRows, subs, redemptions] =
    await Promise.all([
      db.select().from(property).where(eq(property.userId, userId)).orderBy(asc(property.id)),
      db.select().from(feed).where(eq(feed.userId, userId)).orderBy(asc(feed.id)),
      db.select().from(channel).where(eq(channel.userId, userId)).orderBy(asc(channel.id)),
      db.select().from(booking).where(eq(booking.userId, userId)).orderBy(asc(booking.checkIn)),
      db.select().from(ownerClient).where(eq(ownerClient.userId, userId)).orderBy(asc(ownerClient.id)),
      db.select().from(costLine).where(eq(costLine.userId, userId)).orderBy(asc(costLine.position)),
      db.select().from(referral).where(eq(referral.userId, userId)).orderBy(desc(referral.createdAt)),
      db.select().from(supportTicket).where(eq(supportTicket.userId, userId)).orderBy(desc(supportTicket.createdAt)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
      db.select().from(subscription).where(eq(subscription.userId, userId)).limit(1),
      db.select().from(promoRedemption).where(eq(promoRedemption.userId, userId)).orderBy(desc(promoRedemption.redeemedAt)),
    ])

  // Support-message threads live under the user's tickets (keyed by ticketId),
  // so fetch them separately once we know the ticket ids.
  const ticketIds = tickets.map((t) => t.id)
  const supportMessages =
    ticketIds.length > 0
      ? await db.select().from(supportMessage).where(inArray(supportMessage.ticketId, ticketIds)).orderBy(asc(supportMessage.id))
      : []

  return {
    exportedAt: new Date().toISOString(),
    account: me ?? null,
    subscription: subs[0] ?? null,
    settings: settingsRows[0] ?? null,
    properties,
    feeds,
    channels,
    bookings,
    owners,
    costLines,
    referrals,
    promoRedemptions: redemptions,
    supportTickets: tickets,
    supportMessages,
  }
}

// Timestamp columns across the restorable tables. Backups serialize these as
// ISO strings, so they must be revived to Date before re-insert.
const RESTORE_TIMESTAMP_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'lastAttemptAt',
  'lastSyncedAt',
  'nextRetryAt',
])

// Sanitize one exported row for re-insert: drop the old serial id (a fresh one
// is generated), force ownership to the current user, and revive timestamp
// strings. Invalid/missing timestamps are dropped so the column default applies.
function reviveRestoreRow(row: Record<string, unknown>, userId: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') continue
    if (RESTORE_TIMESTAMP_KEYS.has(key)) {
      if (value == null) {
        out[key] = null
      } else {
        const d = new Date(value as string)
        if (!Number.isNaN(d.getTime())) out[key] = d
      }
      continue
    }
    out[key] = value
  }
  out.userId = userId
  return out
}

// Restore the signed-in user's operational data from a backup file produced by
// exportMyData. This REPLACES the user's properties, feeds, channels, bookings,
// owners, cost lines and settings in a single transaction (all-or-nothing).
//
// Deliberately NOT restored: identity (user/account/session), billing
// (subscription), referrals, promo redemptions, support tickets/messages and
// security questions — restoring those could resurrect stale billing state,
// grant unearned credit, or corrupt support/auth records. Outgoing iCal feed
// tokens are cleared on restore to avoid colliding with the global-unique
// token index (the host simply re-enables publishing).
export async function restoreMyData(payload: unknown): Promise<MutationResult> {
  const userId = await getUserId()

  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'That file is not a StayKnit backup.' }
  }
  const p = payload as Record<string, unknown>
  const asRows = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  const properties = asRows(p.properties)
  const feeds = asRows(p.feeds)
  const channels = asRows(p.channels)
  const bookings = asRows(p.bookings)
  const owners = asRows(p.owners)
  const costLines = asRows(p.costLines)
  const settingsRow =
    p.settings && typeof p.settings === 'object' ? (p.settings as Record<string, unknown>) : null

  if (
    !properties.length &&
    !feeds.length &&
    !channels.length &&
    !bookings.length &&
    !owners.length &&
    !costLines.length &&
    !settingsRow
  ) {
    return { ok: false, error: 'That file has no StayKnit data to restore.' }
  }

  try {
    await db.transaction(async (tx) => {
      // Clear the current operational rows (scoped to this user) before reinsert.
      await Promise.all([
        tx.delete(booking).where(eq(booking.userId, userId)),
        tx.delete(feed).where(eq(feed.userId, userId)),
        tx.delete(channel).where(eq(channel.userId, userId)),
        tx.delete(ownerClient).where(eq(ownerClient.userId, userId)),
        tx.delete(costLine).where(eq(costLine.userId, userId)),
        tx.delete(property).where(eq(property.userId, userId)),
      ])

      if (properties.length) {
        await tx.insert(property).values(
          properties.map((r) => ({
            ...reviveRestoreRow(r, userId),
            icalFeedToken: null,
          })) as unknown as (typeof property.$inferInsert)[],
        )
      }

      // Feeds regenerate their serial ids, so remember old→new so feed-imported
      // bookings can be re-pointed at the restored feed rows.
      const feedIdMap = new Map<number, number>()
      for (const r of feeds) {
        const oldId = typeof r.id === 'number' ? r.id : null
        const [inserted] = await tx
          .insert(feed)
          .values(reviveRestoreRow(r, userId) as unknown as typeof feed.$inferInsert)
          .returning({ id: feed.id })
        if (oldId != null && inserted) feedIdMap.set(oldId, inserted.id)
      }

      if (channels.length) {
        await tx
          .insert(channel)
          .values(channels.map((r) => reviveRestoreRow(r, userId)) as unknown as (typeof channel.$inferInsert)[])
      }
      if (owners.length) {
        await tx
          .insert(ownerClient)
          .values(owners.map((r) => reviveRestoreRow(r, userId)) as unknown as (typeof ownerClient.$inferInsert)[])
      }
      if (costLines.length) {
        await tx
          .insert(costLine)
          .values(costLines.map((r) => reviveRestoreRow(r, userId)) as unknown as (typeof costLine.$inferInsert)[])
      }
      if (bookings.length) {
        await tx.insert(booking).values(
          bookings.map((r) => {
            const row = reviveRestoreRow(r, userId)
            const src = row.sourceFeedId
            // Re-point to the restored feed; drop the link if the feed is gone.
            row.sourceFeedId = typeof src === 'number' && feedIdMap.has(src) ? feedIdMap.get(src)! : null
            return row
          }) as unknown as (typeof booking.$inferInsert)[],
        )
      }

      if (settingsRow) {
        await tx.delete(userSettings).where(eq(userSettings.userId, userId))
        await tx
          .insert(userSettings)
          .values(reviveRestoreRow(settingsRow, userId) as unknown as typeof userSettings.$inferInsert)
      }
    })
  } catch (err) {
    console.log('[v0] restoreMyData failed:', (err as Error)?.message)
    return { ok: false, error: 'Restore failed — your existing data was left unchanged.' }
  }

  revalidatePath('/')
  return { ok: true }
}
