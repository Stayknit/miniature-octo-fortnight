import 'server-only'
import { db } from '@/lib/db'
import { adminAuditLog } from '@/lib/db/schema'

// Single source of truth for the admin audit trail. Every sensitive action taken
// from the admin surface (refunds, plan changes, invoice approvals, contact
// edits, price/VAT changes) writes one append-only row here so there is a
// durable record of who did what to which account and when.
//
// Best-effort by design: a failure to record the audit row must never roll back
// or block the underlying action (e.g. a refund that already moved money at
// Paystack). We log the failure server-side instead.
export async function logAdminAction(
  agentEmail: string,
  targetUserId: string,
  action: string,
  detail: string,
): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({ agentEmail, targetUserId, action, detail })
  } catch (err) {
    console.error('[v0] logAdminAction failed', { action, targetUserId }, err)
  }
}
