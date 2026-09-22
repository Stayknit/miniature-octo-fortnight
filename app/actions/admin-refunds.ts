'use server'

import { db } from '@/lib/db'
import { refundRequest, user } from '@/lib/db/schema'
import { assertAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { refundTransaction } from '@/lib/paystack'
import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export type RefundRequestRow = {
  id: number
  email: string | null
  name: string | null
  businessName: string | null
  paymentRef: string
  currency: string
  amountCents: number
  status: string
  note: string | null
  requestedAt: string
  resolvedAt: string | null
  resolvedBy: string | null
}

// Owner-only: cancellation refund requests, pending first, newest first. Feeds
// the admin Payments area so the owner can approve or decline each pro-rata
// refund before any money moves.
export async function getRefundRequests(): Promise<RefundRequestRow[]> {
  await assertAdmin()
  const rows = await db
    .select({
      id: refundRequest.id,
      email: user.email,
      name: user.name,
      businessName: user.businessName,
      paymentRef: refundRequest.paymentRef,
      currency: refundRequest.currency,
      amountCents: refundRequest.amountCents,
      status: refundRequest.status,
      note: refundRequest.note,
      requestedAt: refundRequest.requestedAt,
      resolvedAt: refundRequest.resolvedAt,
      resolvedBy: refundRequest.resolvedBy,
    })
    .from(refundRequest)
    .leftJoin(user, eq(user.id, refundRequest.userId))
    .orderBy(desc(refundRequest.requestedAt))
    .limit(100)
  // Pending float to the top; otherwise keep newest-first.
  const rank = (s: string) => (s === 'pending' ? 0 : 1)
  return rows
    .map((r) => ({
      ...r,
      requestedAt: r.requestedAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    }))
    .sort((a, b) => rank(a.status) - rank(b.status))
}

export type ResolveRefundResult = { ok: boolean; error?: string; status?: string }

// Approve a pending refund: call Paystack for the stored partial amount, then
// mark the request approved (or failed if Paystack rejects). Idempotent on
// status — a request that isn't pending is left untouched.
export async function approveRefundRequest(id: number): Promise<ResolveRefundResult> {
  const admin = await assertAdmin()
  const [req] = await db.select().from(refundRequest).where(eq(refundRequest.id, id)).limit(1)
  if (!req) return { ok: false, error: 'Refund request not found.' }
  if (req.status !== 'pending') return { ok: false, error: `Already ${req.status}.` }

  const res = await refundTransaction(req.paymentRef, req.amountCents)
  if (!res.ok) {
    await db
      .update(refundRequest)
      .set({ status: 'failed', resolvedAt: new Date(), resolvedBy: admin.email, paystackRefundStatus: res.status ?? null })
      .where(and(eq(refundRequest.id, id), eq(refundRequest.status, 'pending')))
    await logAdminAction(
      admin.email,
      req.userId,
      'refund.approve_failed',
      `req #${id} ${req.currency} ${(req.amountCents / 100).toFixed(2)} ref ${req.paymentRef} (Paystack: ${res.status ?? 'declined'})`,
    )
    revalidatePath('/admin/accounts')
    return { ok: false, error: 'Paystack refused the refund. Marked as failed — retry from the Paystack dashboard if needed.' }
  }

  await db
    .update(refundRequest)
    .set({ status: 'approved', resolvedAt: new Date(), resolvedBy: admin.email, paystackRefundStatus: res.status ?? null })
    .where(and(eq(refundRequest.id, id), eq(refundRequest.status, 'pending')))
  await logAdminAction(
    admin.email,
    req.userId,
    'refund.approve',
    `req #${id} ${req.currency} ${(req.amountCents / 100).toFixed(2)} ref ${req.paymentRef}`,
  )
  revalidatePath('/admin/accounts')
  return { ok: true, status: res.status }
}

// Decline a pending refund. The host's cancellation still stands (access ends
// at the notice date); only the money-back is refused.
export async function rejectRefundRequest(id: number): Promise<ResolveRefundResult> {
  const admin = await assertAdmin()
  const [req] = await db.select().from(refundRequest).where(eq(refundRequest.id, id)).limit(1)
  if (!req) return { ok: false, error: 'Refund request not found.' }
  if (req.status !== 'pending') return { ok: false, error: `Already ${req.status}.` }
  await db
    .update(refundRequest)
    .set({ status: 'rejected', resolvedAt: new Date(), resolvedBy: admin.email })
    .where(and(eq(refundRequest.id, id), eq(refundRequest.status, 'pending')))
  await logAdminAction(
    admin.email,
    req.userId,
    'refund.reject',
    `req #${id} ${req.currency} ${(req.amountCents / 100).toFixed(2)} ref ${req.paymentRef}`,
  )
  revalidatePath('/admin/accounts')
  return { ok: true }
}
