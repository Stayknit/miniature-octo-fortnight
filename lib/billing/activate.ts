import { db } from '@/lib/db'
import { subscription, user } from '@/lib/db/schema'
import { and, eq, or, isNull, ne } from 'drizzle-orm'
import { isPaid, periodFor, planFor, TRIAL_DAYS } from '@/lib/plans'
import { applyPriceOverrides, applyPromoPct, chargeCurrencyFor, periodPricing } from '@/lib/pricing'
import { getPriceOverrides } from '@/lib/billing/plan-prices'
import type { BillingPeriod, CurrencyCode, PlanKey } from '@/lib/types'
import { verifyTransaction } from '@/lib/paystack'
import { formatMoney } from '@/lib/currency'
import { sendPlanInvoiceEmail, sendRefundEmail } from '@/lib/email'
import { getVatConfig, vatBreakdown } from '@/lib/vat'
import { consumeCheckoutDiscount } from '@/lib/promo'
import { receiptUrlFor } from '@/lib/site-url'

export type ActivationResult = { ok: boolean; alreadyProcessed?: boolean }

// Shared, idempotent plan activation used by BOTH the client-side confirm
// (confirmPlanCheckout) and the Paystack webhook. Both race to activate the same
// transaction; the `lastPaymentRef` guard means whichever commits first wins and
// the other becomes a harmless no-op — so a host is never granted two
// overlapping access windows for a single payment, and a dropped client confirm
// is still honoured by the webhook.
//
// `expectedUserId` is passed by the client path (it must match the logged-in
// user); the webhook passes undefined because it trusts the HMAC signature and
// the userId carried in the transaction metadata.
export async function activatePlanFromReference(
  reference: string,
  expectedUserId?: string,
): Promise<ActivationResult> {
  // Authoritative server-side verification — never trust the client.
  const tx = await verifyTransaction(reference)
  if (!tx || tx.status !== 'success') return { ok: false }

  const meta = tx.metadata ?? {}
  const userId = typeof meta.userId === 'string' ? meta.userId : undefined
  const plan = (typeof meta.plan === 'string' ? meta.plan : undefined) as PlanKey | undefined
  const period = ((typeof meta.period === 'string' ? meta.period : undefined) as BillingPeriod | undefined) ?? 'yearly'
  // Whether the host opted into auto-renewal for THIS purchase. Metadata is
  // JSON so the flag can arrive as a boolean or the string "true".
  const wantsAutoRenew = meta.autoRenew === true || meta.autoRenew === 'true'
  // Auto-renewal is only possible with a reusable card authorization. If the
  // host opted in but paid by a non-reusable method, we can't honour it.
  const canAutoRenew = wantsAutoRenew && tx.reusable && Boolean(tx.authorizationCode)

  if (!userId || !plan || !isPaid(plan)) return { ok: false }
  // The client path additionally requires the payer to be the logged-in user.
  if (expectedUserId && userId !== expectedUserId) return { ok: false }

  // Defense in depth: re-derive what this plan/period should have cost in the
  // charged currency and confirm Paystack actually collected that amount, so a
  // tampered or replayed reference can't unlock a plan it didn't pay for.
  const def = applyPriceOverrides(planFor(plan), await getPriceOverrides())
  const charged = chargeCurrencyFor((tx.currency.toLowerCase() as CurrencyCode) ?? 'zar')
  const { totalCents } = periodPricing(def, charged, period)
  // A host may hold a checkout discount (promo code). startPlanCheckout charges
  // the DISCOUNTED total and records the applied percent in the transaction
  // metadata — which is server-set, so Paystack echoes it back verbatim on
  // verify and the webhook path has it under the HMAC signature. Re-derive the
  // same expected charge here; comparing against the full (undiscounted) total
  // would reject every discounted payment, charging the host but never
  // activating their plan.
  const promoPct = Number(meta.promoPct) || 0
  const expectedCents = applyPromoPct(totalCents, promoPct)
  if (!expectedCents || tx.amount < expectedCents) return { ok: false }

  await ensureSubscription(userId)

  // Prepaid one-time term: access runs for the paid months PLUS bonus free
  // months, after which applyPendingCancellation (on read) reverts to trial.
  // Renewal stacking: if the host still has a paid term running (cancelAt in the
  // future), the new term is added ON TOP of the time remaining rather than
  // resetting from today — so renewing early never throws away paid days.
  const [current] = await db
    .select({ cancelAt: subscription.cancelAt })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1)
  const now = Date.now()
  const base =
    current?.cancelAt && new Date(current.cancelAt).getTime() > now ? new Date(current.cancelAt) : new Date(now)
  const { months, bonusMonths } = periodFor(period)
  const accessEndsAt = new Date(base)
  accessEndsAt.setMonth(accessEndsAt.getMonth() + months + bonusMonths)

  // Idempotency guard: only activate when this exact reference hasn't already
  // been recorded. `lastPaymentRef IS DISTINCT FROM reference` is expressed as
  // (lastPaymentRef IS NULL OR lastPaymentRef <> reference).
  const updated = await db
    .update(subscription)
    .set({
      plan,
      billingPeriod: period,
      status: 'active',
      foundingRate: true,
      cancelAt: accessEndsAt,
      // The true paid-term end, mirrored so a later cancel can shorten cancelAt
      // to the notice period while resume can restore the full term.
      termEndsAt: accessEndsAt,
      // A fresh purchase clears any prior self-cancellation intent.
      canceledAt: null,
      lastPaymentRef: reference,
      // Persist the opt-in flag and the reusable card token so the renewals cron
      // can charge again. Always refresh the stored authorization when a reusable
      // one is present (cards can change between purchases); when the host did NOT
      // opt in we leave autoRenew false but still keep the token, so a later
      // toggle-on needs no re-entry.
      autoRenew: canAutoRenew,
      chargeCurrency: tx.currency.toLowerCase(),
      ...(tx.reusable && tx.authorizationCode
        ? { paystackAuthCode: tx.authorizationCode, paystackCustomerCode: tx.customerCode }
        : {}),
      // Fresh term: clear the last renewal attempt so the cron may act next cycle.
      renewalAttemptedAt: null,
      // Re-arm expiry reminders for this fresh term (both notices can fire again).
      expiryNoticeStage: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subscription.userId, userId),
        or(isNull(subscription.lastPaymentRef), ne(subscription.lastPaymentRef, reference)),
      ),
    )
    .returning({ userId: subscription.userId })

  // Zero rows updated means this reference was already activated by the other
  // path — success, just nothing new to do.
  const alreadyProcessed = updated.length === 0

  // A discount is single-use per user: now that it has reduced this successful
  // payment, mark it consumed so future checkouts are full price. Only on the
  // FIRST activation of this reference (the guard above ensures exactly one path
  // sees updated.length > 0) and only when a discount was actually applied.
  // Best-effort: a failure here must never roll back a paid activation.
  if (!alreadyProcessed && promoPct > 0) {
    try {
      await consumeCheckoutDiscount(userId)
    } catch (err) {
      console.error('[v0] consuming checkout discount failed (activation still succeeded)', err)
    }
  }

  // Email the host their payment receipt/invoice — but only on the FIRST
  // activation of this reference (the idempotency guard above guarantees exactly
  // one path sees updated.length > 0), so a renewal and a webhook race can't
  // double-send. A mail failure must never roll back a paid activation, so this
  // is best-effort and swallowed with a loud log.
  if (!alreadyProcessed) {
    try {
      const [u] = await db
        .select({ email: user.email, name: user.name })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)
      if (u?.email) {
        // VAT presentation follows StayKnit's operator VAT config. When not a
        // registered vendor (the default) `vat` is null and the email is a plain
        // receipt; once registered it becomes a proper tax invoice. The gross
        // never changes — VAT is back-computed as already included in tx.amount.
        const cur = tx.currency.toUpperCase()
        const bd = vatBreakdown(tx.amount, await getVatConfig())
        await sendPlanInvoiceEmail({
          to: u.email,
          hostName: u.name ?? undefined,
          planName: planFor(plan).name,
          periodName: periodFor(period).name,
          amountLabel: formatMoney(tx.amount / 100, cur),
          reference,
          // Use Paystack's charge date (not "now") so the invoice number here
          // matches the one the hosted receipt page derives on later views.
          paidAt: tx.paidAt ? new Date(tx.paidAt) : new Date(),
          accessUntil: accessEndsAt,
          receiptUrl: receiptUrlFor(reference),
          vat: bd.registered
            ? {
                ratePct: bd.ratePct,
                subtotalLabel: formatMoney(bd.netCents / 100, cur),
                vatLabel: formatMoney(bd.vatCents / 100, cur),
                number: bd.number,
              }
            : null,
        })
      }
    } catch (err) {
      console.error('[v0] invoice email failed (activation still succeeded)', err)
    }
  }

  return { ok: true, alreadyProcessed }
}

export type RefundRevertResult = {
  ok: boolean
  reverted: boolean
  reason?: 'no-matching-subscription' | 'already-reverted' | 'partial-refund'
}

// Revert a host to the (expired) free trial when Paystack confirms a refund of
// the payment that unlocked their current paid term. The counterpart to
// activatePlanFromReference: activation grants access on charge.success, this
// revokes it on refund.processed. Mirrors applyPendingCancellation's field set
// (plan -> trial, status -> canceled) but takes effect immediately rather than
// waiting for the term-end date, and leaves trialEndsAt untouched so the
// existing (past) trial date re-triggers the re-subscribe freeze.
//
// Safeguards:
// - Idempotent: matches only the subscription still backed by this exact
//   reference and only while it is on a paid plan, so re-delivered refund
//   events and an already-reverted account are harmless no-ops.
// - Partial refunds do NOT revoke access. When Paystack reports a refund
//   smaller than the original charge (re-verified server-side), the host keeps
//   their paid term — a partial/goodwill refund shouldn't cut off access.
export async function revertPlanForRefund(
  transactionReference: string,
  refundedAmountSubunits?: number,
): Promise<RefundRevertResult> {
  const [sub] = await db
    .select({ userId: subscription.userId, plan: subscription.plan })
    .from(subscription)
    .where(eq(subscription.lastPaymentRef, transactionReference))
    .limit(1)
  if (!sub) return { ok: true, reverted: false, reason: 'no-matching-subscription' }
  // Already reverted (or never a paid term): nothing to revoke.
  if (!isPaid(sub.plan)) return { ok: true, reverted: false, reason: 'already-reverted' }

  // Only a full refund revokes access. Re-verify the original charge with
  // Paystack (never trust the webhook amount alone) and compare.
  if (typeof refundedAmountSubunits === 'number' && refundedAmountSubunits > 0) {
    const tx = await verifyTransaction(transactionReference)
    if (tx && tx.amount > 0 && refundedAmountSubunits < tx.amount) {
      return { ok: true, reverted: false, reason: 'partial-refund' }
    }
  }

  // Atomic idempotency guard: the WHERE still pins lastPaymentRef, so concurrent
  // or re-delivered refund events collapse to a single revert (the rest match
  // zero rows once the ref is detached below).
  const updated = await db
    .update(subscription)
    .set({
      plan: 'trial',
      billingPeriod: 'yearly',
      status: 'canceled',
      cancelAt: null,
      termEndsAt: null,
      canceledAt: null,
      foundingRate: false,
      // Stop any opt-in auto-renewal so a refunded host is never charged again.
      autoRenew: false,
      // Re-arm reminders for a future term and detach the refunded payment so a
      // fresh purchase activates cleanly and duplicate refund events no-op.
      expiryNoticeStage: 0,
      lastPaymentRef: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(subscription.userId, sub.userId), eq(subscription.lastPaymentRef, transactionReference)),
    )
    .returning({ userId: subscription.userId })

  const reverted = updated.length > 0

  // Confirm the refund to the host by email — best-effort, only on the single
  // path that actually performed the revert, and never allowed to fail the
  // revert itself.
  if (reverted) {
    try {
      const [u] = await db
        .select({ email: user.email, name: user.name })
        .from(user)
        .where(eq(user.id, sub.userId))
        .limit(1)
      if (u?.email) {
        // Re-verify to get the charge amount/currency for the receipt (never
        // trust the webhook payload). Use the refunded amount when supplied,
        // otherwise the full original charge.
        const tx = await verifyTransaction(transactionReference)
        const subunits =
          typeof refundedAmountSubunits === 'number' && refundedAmountSubunits > 0
            ? refundedAmountSubunits
            : tx?.amount
        const amountLabel =
          subunits && subunits > 0 ? formatMoney(subunits / 100, (tx?.currency ?? 'zar').toUpperCase()) : undefined
        await sendRefundEmail({
          to: u.email,
          hostName: u.name ?? undefined,
          planName: planFor(sub.plan).name,
          amountLabel,
          reference: transactionReference,
          refundedAt: new Date(),
          fullRefund: true,
          receiptUrl: receiptUrlFor(transactionReference),
        })
      }
    } catch (err) {
      console.error('[v0] refund email failed (revert still succeeded)', err)
    }
  }

  return { ok: true, reverted, reason: reverted ? undefined : 'already-reverted' }
}

// New hosts start on a 14-day free trial. Kept in sync with the copy in
// app/actions/stayknit.ts (that one also applies pending cancellations on read,
// which activation does not need).
async function ensureSubscription(userId: string) {
  const existing = await db.select().from(subscription).where(eq(subscription.userId, userId)).limit(1)
  if (existing.length > 0) return
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000)
  await db
    .insert(subscription)
    .values({ userId, plan: 'trial', status: 'trialing', trialEndsAt })
    .onConflictDoNothing()
}
