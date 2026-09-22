'use server'

import { assertAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { listTransactions } from '@/lib/paystack'
import { db } from '@/lib/db'
import { user, subscription } from '@/lib/db/schema'
import { inArray, eq } from 'drizzle-orm'
import { isPaid } from '@/lib/plans'
import { sendAbandonedCheckoutEmail } from '@/lib/email'
import { siteOrigin } from '@/lib/site-url'

// A host who started a Paystack checkout but never completed the charge, still
// mapped to a real StayKnit account that hasn't converted to a paid plan. Built
// by cross-referencing Paystack's transaction list with our own users — no new
// table needed, and it can never show someone who already paid.
export type AbandonedCheckoutRow = {
  userId: string
  email: string
  name: string
  businessName: string
  amountCents: number
  currency: string
  reference: string
  txStatus: string // Paystack transaction status (abandoned | failed)
  attemptedAt: string | null // ISO
  subStatus: string // current subscription status (trialing, past_due, …)
}

export type AbandonedCheckoutsResult =
  | { ok: true; rows: AbandonedCheckoutRow[] }
  | { ok: false; error: string }

// Owner-only. Lists recent abandoned/failed Paystack checkouts that belong to
// hosts who still haven't subscribed, so the owner can nudge them back. Read-only
// and resilient: a missing/invalid Paystack key surfaces as a friendly error
// rather than breaking the rest of the Accounts page. Deduped to the most recent
// attempt per host, newest first.
export async function getAbandonedCheckouts(): Promise<AbandonedCheckoutsResult> {
  await assertAdmin()
  try {
    const txns = await listTransactions(100)

    // Keep only non-completing attempts, and — since the list is newest-first —
    // the first one seen per email is that host's most recent abandoned attempt.
    const latestByEmail = new Map<string, (typeof txns)[number]>()
    for (const t of txns) {
      if (!t.email) continue
      if (t.status !== 'abandoned' && t.status !== 'failed') continue
      const key = t.email.toLowerCase()
      if (!latestByEmail.has(key)) latestByEmail.set(key, t)
    }
    if (latestByEmail.size === 0) return { ok: true, rows: [] }

    const emails = [...new Set([...latestByEmail.values()].map((t) => t.email as string))]
    const users = await db
      .select({ id: user.id, email: user.email, name: user.name, businessName: user.businessName })
      .from(user)
      .where(inArray(user.email, emails))
    if (users.length === 0) return { ok: true, rows: [] }

    const userIds = users.map((u) => u.id)
    const subs = await db
      .select({
        userId: subscription.userId,
        status: subscription.status,
        plan: subscription.plan,
        comp: subscription.comp,
      })
      .from(subscription)
      .where(inArray(subscription.userId, userIds))
    const subByUser = new Map(subs.map((s) => [s.userId, s]))

    const rows: AbandonedCheckoutRow[] = []
    for (const u of users) {
      const t = latestByEmail.get(u.email.toLowerCase())
      if (!t) continue
      const sub = subByUser.get(u.id)
      // Never surface comp/pilot grants (they don't pay) or anyone who already
      // converted to a live paid plan.
      if (sub?.comp) continue
      const converted = sub ? sub.status === 'active' && isPaid(sub.plan) : false
      if (converted) continue
      rows.push({
        userId: u.id,
        email: u.email,
        name: u.name ?? '',
        businessName: u.businessName ?? '',
        amountCents: t.amount,
        currency: t.currency,
        reference: t.reference,
        txStatus: t.status,
        attemptedAt: t.paidAt,
        subStatus: sub?.status ?? 'none',
      })
    }
    rows.sort((a, b) => (b.attemptedAt ?? '').localeCompare(a.attemptedAt ?? ''))
    return { ok: true, rows }
  } catch (err) {
    console.error('[v0] getAbandonedCheckouts failed', err)
    return { ok: false, error: 'Could not load abandoned checkouts from Paystack. Check the secret key and try again.' }
  }
}

export type SendRecoveryResult = { ok: true } | { ok: false; error: string }

// Owner-only. Sends the abandoned-checkout recovery nudge to one host and writes
// an audit row. The CTA points at the host's own plan tab, where the normal
// server-side checkout re-runs (fresh reference, current pricing) — so this only
// invites them back; it never charges or changes their account.
export async function sendCheckoutRecoveryEmail(userId: string): Promise<SendRecoveryResult> {
  const admin = await assertAdmin()
  const id = (userId ?? '').trim()
  if (!id) return { ok: false, error: 'Missing account.' }
  try {
    const [u] = await db
      .select({ email: user.email, name: user.name, businessName: user.businessName })
      .from(user)
      .where(eq(user.id, id))
      .limit(1)
    if (!u?.email) return { ok: false, error: 'That account has no email on file.' }
    const checkoutUrl = `${siteOrigin()}/?tab=plan`
    await sendAbandonedCheckoutEmail(u.email, {
      name: u.name || u.businessName || undefined,
      checkoutUrl,
    })
    await logAdminAction(admin.email, id, 'checkout.recovery_email', `sent to ${u.email}`)
    return { ok: true }
  } catch (err) {
    console.error('[v0] sendCheckoutRecoveryEmail failed', err)
    return { ok: false, error: 'Could not send the reminder. Try again shortly.' }
  }
}
