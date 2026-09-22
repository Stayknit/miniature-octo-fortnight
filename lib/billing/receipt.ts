import 'server-only'
import { db } from '@/lib/db'
import { subscription, user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { verifyTransaction } from '@/lib/paystack'
import { isPaid, periodFor, planFor } from '@/lib/plans'
import type { BillingPeriod, PlanKey } from '@/lib/types'
import { getVatConfig, vatBreakdown } from '@/lib/vat'
import { formatMoney } from '@/lib/currency'
import { invoiceNumber } from '@/lib/email'

export type ReceiptRow = { label: string; value: string; strong?: boolean }

export type Receipt = {
  invoiceNumber: string
  reference: string
  title: string // "Tax invoice" | "Payment received"
  badge: string // "Tax invoice" | "Paid"
  registered: boolean
  billedTo: string
  planName: string
  periodName: string
  amountLabel: string
  paidAtLabel: string
  rows: ReceiptRow[]
  note: string
}

export type ReceiptLookup =
  | { ok: true; receipt: Receipt }
  // not-found: no such successful subscription payment for this reference.
  // forbidden: the reference exists but belongs to another host.
  // unavailable: the payment processor couldn't be reached right now.
  | { ok: false; reason: 'not-found' | 'forbidden' | 'unavailable' }

function longDate(d: Date): string {
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Rebuild a host's payment receipt / tax invoice for a Paystack reference,
// authoritatively and on demand — the same document StayKnit emailed at
// activation, reconstructed from a fresh server-side verification rather than a
// stored copy. Scoped to the signed-in payer: the transaction's metadata.userId
// (server-set at checkout, echoed under Paystack's signature) MUST match, so one
// host can never open another's receipt by guessing a reference. Works even
// after a refund, since the original charge still verifies as successful.
export async function getReceiptForHost(reference: string, userId: string): Promise<ReceiptLookup> {
  let tx
  try {
    tx = await verifyTransaction(reference)
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
  if (!tx) return { ok: false, reason: 'not-found' }

  const meta = tx.metadata ?? {}
  const payerId = typeof meta.userId === 'string' ? meta.userId : undefined
  // Authorization first: never reveal whether an unrelated reference succeeded.
  if (!payerId || payerId !== userId) return { ok: false, reason: 'forbidden' }
  if (tx.status !== 'success') return { ok: false, reason: 'not-found' }

  const plan = (typeof meta.plan === 'string' ? meta.plan : undefined) as PlanKey | undefined
  const period =
    ((typeof meta.period === 'string' ? meta.period : undefined) as BillingPeriod | undefined) ?? 'yearly'
  if (!plan || !isPaid(plan)) return { ok: false, reason: 'not-found' }

  const [u] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  const billedTo = u?.email ?? (typeof meta.email === 'string' ? meta.email : '')

  // "Access valid until" is only meaningful while this exact payment still backs
  // the host's live term. After a renewal supersedes it or a refund detaches it,
  // omit the line rather than show a stale/absent date.
  const [sub] = await db
    .select({ lastPaymentRef: subscription.lastPaymentRef, termEndsAt: subscription.termEndsAt, cancelAt: subscription.cancelAt })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1)
  const accessUntil =
    sub?.lastPaymentRef === reference ? (sub.termEndsAt ?? sub.cancelAt ?? null) : null

  const paidAt = tx.paidAt ? new Date(tx.paidAt) : new Date()
  const cur = tx.currency.toUpperCase()
  const amountLabel = formatMoney(tx.amount / 100, cur)
  const bd = vatBreakdown(tx.amount, await getVatConfig())
  const registered = bd.registered
  const invNo = invoiceNumber(reference, paidAt)
  const planName = planFor(plan).name
  const periodName = periodFor(period).name

  const rows: ReceiptRow[] = [
    { label: registered ? 'Tax invoice number' : 'Invoice number', value: invNo },
    { label: 'Date', value: longDate(paidAt) },
    { label: 'Billed to', value: billedTo },
    { label: 'Plan', value: `StayKnit ${planName}` },
    { label: 'Billing term', value: periodName },
    ...(accessUntil ? [{ label: 'Access valid until', value: longDate(new Date(accessUntil)) }] : []),
    { label: 'Payment reference', value: reference },
    ...(registered
      ? [
          { label: 'Subtotal (excl. VAT)', value: formatMoney(bd.netCents / 100, cur) },
          { label: `VAT (${bd.ratePct}%)`, value: formatMoney(bd.vatCents / 100, cur) },
          { label: 'Total paid (incl. VAT)', value: amountLabel, strong: true },
          { label: 'VAT registration no.', value: bd.number },
        ]
      : [{ label: 'Amount paid', value: amountLabel, strong: true }]),
  ]

  const note = registered
    ? `This is a tax invoice. The total shown includes VAT at ${bd.ratePct}%. VAT registration no. ${bd.number}.`
    : 'StayKnit is not currently registered for VAT, so no VAT is charged on this amount. This document is a payment receipt / invoice, not a SARS tax invoice.'

  return {
    ok: true,
    receipt: {
      invoiceNumber: invNo,
      reference,
      title: registered ? 'Tax invoice' : 'Payment received',
      badge: registered ? 'Tax invoice' : 'Paid',
      registered,
      billedTo,
      planName,
      periodName,
      amountLabel,
      paidAtLabel: longDate(paidAt),
      rows,
      note,
    },
  }
}
