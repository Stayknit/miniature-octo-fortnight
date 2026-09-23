// The orchestrator. It is the only place that writes to the channel-sync
// tables, and it enforces the system's guarantees:
//
//   1. Idempotent — reservations upsert on (channel, externalBookingId), so
//      re-running a sync updates in place and never duplicates.
//   2. Honest — an adapter that isn't ready (no credentials) is SKIPPED and
//      audited, never counted as a success or a failure.
//   3. Auditable — every changed availability field is written to change_log;
//      every skip / dropped-financials / error is written to channel_audit_log.
//   4. Capability-bounded — financial data from an adapter that did not declare
//      `financials: true` is dropped and audited, so a channel can never exceed
//      what it's allowed to write. (The iCal adapter can therefore never affect
//      money, no matter what it returns.)

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  auditLog,
  changeLog,
  channelConnection,
  financialBreakdown,
  reservation,
} from './schema'
import {
  AwaitingCredentialsError,
  type ChannelAdapter,
  type ChannelConnection,
  type FinancialBreakdown,
  type Reservation,
  type SyncOutcome,
} from './types'

// The availability fields we diff + log. Money is intentionally excluded — it
// is not part of the reservation and is tracked in its own table.
const TRACKED_FIELDS = ['guestName', 'checkIn', 'checkOut', 'status'] as const

async function recordAudit(
  userId: string | null,
  channel: string,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({ userId, channel, action, detail })
}

async function markConnection(
  connection: ChannelConnection,
  status: 'ok' | 'skipped' | 'error',
  error: string | null,
): Promise<void> {
  const now = new Date()
  await db
    .update(channelConnection)
    .set({
      lastAttemptAt: now,
      lastStatus: status,
      lastError: error,
      ...(status === 'ok' ? { lastSyncedAt: now } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(channelConnection.userId, connection.userId),
        eq(channelConnection.propertyId, connection.propertyId),
        eq(channelConnection.channel, connection.channel),
      ),
    )
}

// Compare an incoming reservation against the stored row and return the fields
// that changed. Used to write change_log entries.
function diffReservation(
  existing: typeof reservation.$inferSelect,
  incoming: Reservation,
): { field: string; oldValue: string | null; newValue: string | null }[] {
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = []
  for (const field of TRACKED_FIELDS) {
    const before = (existing[field] ?? null) as string | null
    const after = (incoming[field] ?? null) as string | null
    if (before !== after) changes.push({ field, oldValue: before, newValue: after })
  }
  return changes
}

async function upsertReservation(incoming: Reservation): Promise<{ changed: number }> {
  const [existing] = await db
    .select()
    .from(reservation)
    .where(
      and(
        eq(reservation.channel, incoming.channel),
        eq(reservation.externalBookingId, incoming.externalBookingId),
      ),
    )

  const changes = existing ? diffReservation(existing, incoming) : []
  const now = new Date()

  await db
    .insert(reservation)
    .values({
      userId: incoming.userId,
      propertyId: incoming.propertyId,
      channel: incoming.channel,
      externalBookingId: incoming.externalBookingId,
      guestName: incoming.guestName,
      checkIn: incoming.checkIn,
      checkOut: incoming.checkOut,
      status: incoming.status,
      raw: incoming.raw ?? null,
    })
    .onConflictDoUpdate({
      target: [reservation.channel, reservation.externalBookingId],
      set: {
        guestName: incoming.guestName,
        checkIn: incoming.checkIn,
        checkOut: incoming.checkOut,
        status: incoming.status,
        raw: incoming.raw ?? null,
        updatedAt: now,
      },
    })

  if (changes.length) {
    await db.insert(changeLog).values(
      changes.map((c) => ({
        userId: incoming.userId,
        channel: incoming.channel,
        externalBookingId: incoming.externalBookingId,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
      })),
    )
  }

  return { changed: existing ? (changes.length ? 1 : 0) : 1 }
}

async function upsertFinancial(userId: string, fin: FinancialBreakdown): Promise<void> {
  const now = new Date()
  await db
    .insert(financialBreakdown)
    .values({
      userId,
      channel: fin.channel,
      externalBookingId: fin.externalBookingId,
      currency: fin.currency,
      grossAmount: fin.grossAmount,
      channelCommission: fin.channelCommission,
      cleaningFee: fin.cleaningFee,
      taxAmount: fin.taxAmount,
      netPayout: fin.netPayout,
      source: fin.source,
    })
    .onConflictDoUpdate({
      target: [financialBreakdown.channel, financialBreakdown.externalBookingId],
      set: {
        currency: fin.currency,
        grossAmount: fin.grossAmount,
        channelCommission: fin.channelCommission,
        cleaningFee: fin.cleaningFee,
        taxAmount: fin.taxAmount,
        netPayout: fin.netPayout,
        source: fin.source,
        updatedAt: now,
      },
    })
}

// Sync one adapter for one connection. Never throws for the expected
// "not ready" case — that path is a recorded skip.
export async function syncConnection(
  adapter: ChannelAdapter,
  connection: ChannelConnection,
): Promise<SyncOutcome> {
  const base: SyncOutcome = {
    channel: adapter.channel,
    propertyId: connection.propertyId,
    skipped: false,
    reservationsUpserted: 0,
    reservationsChanged: 0,
    financialsUpserted: 0,
  }

  // (2) Skip, don't fake, when the adapter has no way to run yet.
  if (!adapter.isReady(connection)) {
    await recordAudit(connection.userId, adapter.channel, 'skipped_awaiting_credentials', {
      propertyId: connection.propertyId,
    })
    await markConnection(connection, 'skipped', 'awaiting credentials')
    return { ...base, skipped: true, reason: 'awaiting_credentials' }
  }

  let result
  try {
    result = await adapter.fetch(connection)
  } catch (err) {
    // An AwaitingCredentialsError is an honest skip even if isReady() was
    // optimistic; anything else is a real error.
    if (err instanceof AwaitingCredentialsError) {
      await recordAudit(connection.userId, adapter.channel, 'skipped_awaiting_credentials', {
        propertyId: connection.propertyId,
        requirement: err.partnerRequirement,
      })
      await markConnection(connection, 'skipped', 'awaiting credentials')
      return { ...base, skipped: true, reason: 'awaiting_credentials' }
    }
    const message = err instanceof Error ? err.message : 'unknown sync error'
    await recordAudit(connection.userId, adapter.channel, 'sync_error', {
      propertyId: connection.propertyId,
      message,
    })
    await markConnection(connection, 'error', message)
    return { ...base, error: message }
  }

  // (4) Enforce the capability boundary. Money from a non-financial adapter is
  // dropped and audited — the iCal adapter can never touch a price.
  let financials = result.financials
  if (!adapter.capabilities.financials && financials.length > 0) {
    await recordAudit(connection.userId, adapter.channel, 'financials_dropped', {
      propertyId: connection.propertyId,
      dropped: financials.length,
      reason: 'adapter does not declare the financials capability',
    })
    financials = []
  }

  // (1) Idempotent upserts + (3) change logging.
  let changed = 0
  for (const r of result.reservations) {
    const res = await upsertReservation(r)
    changed += res.changed
  }
  for (const fin of financials) {
    await upsertFinancial(connection.userId, fin)
  }

  await recordAudit(connection.userId, adapter.channel, 'sync_ok', {
    propertyId: connection.propertyId,
    reservations: result.reservations.length,
    changed,
    financials: financials.length,
  })
  await markConnection(connection, 'ok', null)

  return {
    ...base,
    reservationsUpserted: result.reservations.length,
    reservationsChanged: changed,
    financialsUpserted: financials.length,
  }
}

// The adapter registry. Adding a channel = importing its adapter and adding one
// entry here. The engine needs nothing else.
import { icalAdapter } from './ical-adapter'
import { bookingComAdapter } from './booking-com-adapter'
import { airbnbAdapter } from './airbnb-adapter'
import { lekkerslaapAdapter } from './lekkerslaap-adapter'
import { nightsbridgeAdapter } from './nightsbridge-adapter'
import type { ChannelId } from './types'

export const ADAPTERS: Record<ChannelId, ChannelAdapter> = {
  ICAL: icalAdapter,
  BOOKING_COM: bookingComAdapter,
  AIRBNB: airbnbAdapter,
  LEKKERSLAAP: lekkerslaapAdapter,
  NIGHTSBRIDGE: nightsbridgeAdapter,
}

// Sync every configured connection. Each connection carries its own channel, so
// the engine routes it to the right adapter. Runs sequentially to keep DB load
// predictable; a cron calls this on a schedule (see README).
export async function syncAllConnections(connections: ChannelConnection[]): Promise<SyncOutcome[]> {
  const outcomes: SyncOutcome[] = []
  for (const connection of connections) {
    const adapter = ADAPTERS[connection.channel]
    if (!adapter) {
      await recordAudit(connection.userId, connection.channel, 'sync_error', {
        propertyId: connection.propertyId,
        message: `no adapter registered for channel ${connection.channel}`,
      })
      outcomes.push({
        channel: connection.channel,
        propertyId: connection.propertyId,
        skipped: true,
        reason: 'no_adapter',
        reservationsUpserted: 0,
        reservationsChanged: 0,
        financialsUpserted: 0,
      })
      continue
    }
    outcomes.push(await syncConnection(adapter, connection))
  }
  return outcomes
}
