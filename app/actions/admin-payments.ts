'use server'

import { assertAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { listTransactions, listRefundedTransactionIds, refundTransaction } from '@/lib/paystack'
import { revalidatePath } from 'next/cache'

export type PaymentRow = {
  id: number
  reference: string
  amountCents: number // subunits in `currency`
  currency: string // e.g. "ZAR"
  status: string // Paystack transaction status
  channel: string | null
  paidAt: string | null // ISO
  email: string | null
  refunded: boolean // a non-failed refund already exists for this transaction
}

export type PaymentsResult =
  | { ok: true; payments: PaymentRow[] }
  | { ok: false; error: string }

// Recent Paystack transactions for the owner's payments panel, each flagged
// with whether it's already been refunded. Owner-only; Paystack calls run
// entirely server-side. A missing/invalid key surfaces as a friendly error
// rather than a crash, so the rest of the Accounts page keeps working.
export async function getRecentPayments(): Promise<PaymentsResult> {
  await assertAdmin()
  try {
    const [txns, refundedIds] = await Promise.all([listTransactions(50), listRefundedTransactionIds(100)])
    const payments: PaymentRow[] = txns.map((t) => ({
      id: t.id,
      reference: t.reference,
      amountCents: t.amount,
      currency: t.currency,
      status: t.status,
      channel: t.channel,
      paidAt: t.paidAt,
      email: t.email,
      refunded: refundedIds.has(t.id),
    }))
    return { ok: true, payments }
  } catch (err) {
    console.error('[v0] getRecentPayments failed', err)
    return { ok: false, error: 'Could not load payments from Paystack. Check the secret key and try again.' }
  }
}

export type RefundResult = { ok: true } | { ok: false; error: string }

// Refund a transaction by reference (full refund by default; pass
// `amountCents` for a partial). Owner-only. The Paystack refund is
// asynchronous — a successful call means the refund was accepted, and it then
// settles back to the customer's card over the next few business days.
export async function refundPayment(reference: string, amountCents?: number): Promise<RefundResult> {
  const admin = await assertAdmin()
  const ref = (reference ?? '').trim()
  if (!ref) return { ok: false, error: 'Missing transaction reference.' }
  // Guard a partial amount if one was supplied; omit for a full refund.
  let amount: number | undefined
  if (typeof amountCents === 'number') {
    if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isInteger(amountCents)) {
      return { ok: false, error: 'Enter a valid refund amount.' }
    }
    amount = amountCents
  }
  try {
    const res = await refundTransaction(ref, amount)
    if (!res.ok) return { ok: false, error: 'Paystack declined the refund. It may already be refunded.' }
    await logAdminAction(
      admin.email,
      '',
      'payment.refund',
      `ref ${ref} ${typeof amount === 'number' ? `partial ${(amount / 100).toFixed(2)}` : 'full'}`,
    )
    revalidatePath('/admin/accounts')
    return { ok: true }
  } catch (err) {
    console.error('[v0] refundPayment failed', err)
    return { ok: false, error: 'The refund could not be processed. Try again shortly.' }
  }
}
