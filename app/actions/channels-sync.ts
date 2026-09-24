'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { property } from '@/lib/db/schema'
import {
  auditLog,
  changeLog,
  channelConnection,
  financialBreakdown,
  reservation,
} from '@/lib/channels/schema'
import { ADAPTERS, syncAllConnections } from '@/lib/channels/sync-engine'
import type { ChannelConnection, ChannelId, SyncOutcome } from '@/lib/channels/types'
import { normalizeIcalUrl } from '@/lib/ical'
import { assertSafeUrl } from '@/lib/ssrf'

async function getUserId() {
  const s = await auth.api.getSession({ headers: await headers() })
  if (!s?.user) throw new Error('Unauthorized')
  return s.user.id
}

export type ChannelMeta = {
  id: ChannelId
  displayName: string
  availability: boolean
  financials: boolean
}

export type ConnectionView = {
  id: number
  propertyId: number
  propertyName: string
  channel: ChannelId
  channelLabel: string
  icalUrl: string | null
  status: string
  lastStatus: string | null
  lastError: string | null
  lastSyncedAt: string | null
  reservationCount: number
  financialsCapable: boolean
}

export type ReservationView = {
  id: number
  propertyId: number
  propertyName: string
  channel: ChannelId
  channelLabel: string
  externalBookingId: string
  guestName: string | null
  checkIn: string
  checkOut: string
  status: string
  financial: {
    currency: string
    grossAmount: number
    channelCommission: number
    cleaningFee: number
    taxAmount: number
    netPayout: number
    source: string
  } | null
}

export type AuditView = {
  id: number
  channel: string
  action: string
  detail: unknown
  createdAt: string
}

export type ChannelSyncData = {
  properties: { id: number; name: string }[]
  connections: ConnectionView[]
  reservations: ReservationView[]
  audit: AuditView[]
  catalog: ChannelMeta[]
}

export type MutationResult = { ok: true } | { ok: false; error: string }

function catalog(): ChannelMeta[] {
  return (Object.keys(ADAPTERS) as ChannelId[]).map((id) => ({
    id,
    displayName: ADAPTERS[id].displayName,
    availability: ADAPTERS[id].capabilities.availability,
    financials: ADAPTERS[id].capabilities.financials,
  }))
}

function labelFor(id: ChannelId): string {
  return ADAPTERS[id]?.displayName ?? id
}

// Everything the dashboard needs, in one scoped read. All rows are filtered by
// the session user — the channel-sync tables have no RLS, so per-query userId
// scoping is the boundary (same pattern as the rest of the app).
export async function getChannelSyncData(): Promise<ChannelSyncData> {
  const userId = await getUserId()

  const [props, conns, resvs, fins, counts, audits] = await Promise.all([
    db.select({ id: property.id, name: property.name }).from(property).where(eq(property.userId, userId)),
    db.select().from(channelConnection).where(eq(channelConnection.userId, userId)).orderBy(channelConnection.createdAt),
    db
      .select()
      .from(reservation)
      .where(eq(reservation.userId, userId))
      .orderBy(desc(reservation.checkIn))
      .limit(300),
    db.select().from(financialBreakdown).where(eq(financialBreakdown.userId, userId)),
    db
      .select({
        propertyId: reservation.propertyId,
        channel: reservation.channel,
        n: sql<number>`count(*)::int`,
      })
      .from(reservation)
      .where(eq(reservation.userId, userId))
      .groupBy(reservation.propertyId, reservation.channel),
    db.select().from(auditLog).where(eq(auditLog.userId, userId)).orderBy(desc(auditLog.createdAt)).limit(25),
  ])

  const nameById = new Map(props.map((p) => [p.id, p.name]))
  const countKey = (propertyId: number, channel: string) => `${propertyId}:${channel}`
  const countMap = new Map(counts.map((c) => [countKey(c.propertyId, c.channel), c.n]))
  const finKey = (channel: string, ext: string) => `${channel}:${ext}`
  const finMap = new Map(fins.map((f) => [finKey(f.channel, f.externalBookingId), f]))

  const connections: ConnectionView[] = conns.map((c) => ({
    id: c.id,
    propertyId: c.propertyId,
    propertyName: nameById.get(c.propertyId) ?? 'Unknown unit',
    channel: c.channel as ChannelId,
    channelLabel: labelFor(c.channel as ChannelId),
    icalUrl: c.icalUrl,
    status: c.status,
    lastStatus: c.lastStatus,
    lastError: c.lastError,
    lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
    reservationCount: countMap.get(countKey(c.propertyId, c.channel)) ?? 0,
    financialsCapable: ADAPTERS[c.channel as ChannelId]?.capabilities.financials ?? false,
  }))

  const reservations: ReservationView[] = resvs.map((r) => {
    const f = finMap.get(finKey(r.channel, r.externalBookingId))
    return {
      id: r.id,
      propertyId: r.propertyId,
      propertyName: nameById.get(r.propertyId) ?? 'Unknown unit',
      channel: r.channel as ChannelId,
      channelLabel: labelFor(r.channel as ChannelId),
      externalBookingId: r.externalBookingId,
      guestName: r.guestName,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
      financial: f
        ? {
            currency: f.currency,
            grossAmount: f.grossAmount,
            channelCommission: f.channelCommission,
            cleaningFee: f.cleaningFee,
            taxAmount: f.taxAmount,
            netPayout: f.netPayout,
            source: f.source,
          }
        : null,
    }
  })

  const audit: AuditView[] = audits.map((a) => ({
    id: a.id,
    channel: a.channel,
    action: a.action,
    detail: a.detail,
    createdAt: a.createdAt.toISOString(),
  }))

  return { properties: props, connections, reservations, audit, catalog: catalog() }
}

// Add a channel connection for one of the host's own units. iCal is usable
// immediately (needs only a valid, public URL); API channels are stored as
// awaiting_credentials and stay skipped-but-honest until real partner access
// exists — exactly what the adapter stubs enforce.
export async function addChannelConnection(input: {
  propertyId: number
  channel: ChannelId
  icalUrl?: string
}): Promise<MutationResult> {
  const userId = await getUserId()

  const [owned] = await db
    .select({ id: property.id })
    .from(property)
    .where(and(eq(property.id, input.propertyId), eq(property.userId, userId)))
  if (!owned) return { ok: false, error: 'That unit is not on your account.' }

  if (!ADAPTERS[input.channel]) return { ok: false, error: 'Unknown channel.' }

  let icalUrl: string | null = null
  let status = 'awaiting_credentials'

  if (input.channel === 'ICAL') {
    const normalized = input.icalUrl ? normalizeIcalUrl(input.icalUrl) : null
    if (!normalized) return { ok: false, error: 'Enter a valid iCal (.ics) URL.' }
    try {
      await assertSafeUrl(normalized)
    } catch {
      return { ok: false, error: 'That URL could not be reached safely. Use a public https feed.' }
    }
    icalUrl = normalized
    status = 'active'
  }

  const [dupe] = await db
    .select({ id: channelConnection.id })
    .from(channelConnection)
    .where(
      and(
        eq(channelConnection.userId, userId),
        eq(channelConnection.propertyId, input.propertyId),
        eq(channelConnection.channel, input.channel),
      ),
    )
  if (dupe) return { ok: false, error: 'That unit is already connected to this channel.' }

  await db.insert(channelConnection).values({
    userId,
    propertyId: input.propertyId,
    channel: input.channel,
    icalUrl,
    status,
  })
  revalidatePath('/channels-sync')
  return { ok: true }
}

export async function updateChannelIcalUrl(id: number, url: string): Promise<MutationResult> {
  const userId = await getUserId()
  const normalized = normalizeIcalUrl(url)
  if (!normalized) return { ok: false, error: 'Enter a valid iCal (.ics) URL.' }
  try {
    await assertSafeUrl(normalized)
  } catch {
    return { ok: false, error: 'That URL could not be reached safely. Use a public https feed.' }
  }
  await db
    .update(channelConnection)
    .set({ icalUrl: normalized, status: 'active', updatedAt: new Date() })
    .where(and(eq(channelConnection.id, id), eq(channelConnection.userId, userId)))
  revalidatePath('/channels-sync')
  return { ok: true }
}

export async function setChannelEnabled(id: number, enabled: boolean): Promise<MutationResult> {
  const userId = await getUserId()
  // Only meaningful for iCal (API channels remain awaiting_credentials). Toggle
  // between active and disabled without discarding the stored feed URL.
  const [row] = await db
    .select()
    .from(channelConnection)
    .where(and(eq(channelConnection.id, id), eq(channelConnection.userId, userId)))
  if (!row) return { ok: false, error: 'Connection not found.' }
  if (row.channel !== 'ICAL') return { ok: false, error: 'Only iCal connections can be toggled here.' }
  await db
    .update(channelConnection)
    .set({ status: enabled ? 'active' : 'disabled', updatedAt: new Date() })
    .where(and(eq(channelConnection.id, id), eq(channelConnection.userId, userId)))
  revalidatePath('/channels-sync')
  return { ok: true }
}

export async function removeChannelConnection(id: number): Promise<MutationResult> {
  const userId = await getUserId()
  await db
    .delete(channelConnection)
    .where(and(eq(channelConnection.id, id), eq(channelConnection.userId, userId)))
  revalidatePath('/channels-sync')
  return { ok: true }
}

// Run the sync engine for every enabled connection on this account. The engine
// itself enforces idempotency, honesty (skips awaiting-credentials adapters),
// and the capability boundary — this action just loads scoped connections,
// maps DB rows to the domain object, and returns the outcomes for display.
export async function syncChannelsNow(): Promise<{ ranAt: string; outcomes: SyncOutcome[] }> {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(channelConnection)
    .where(eq(channelConnection.userId, userId))

  const domain: ChannelConnection[] = rows
    .filter((r) => r.status !== 'disabled')
    .map((r) => ({
      channel: r.channel as ChannelId,
      propertyId: r.propertyId,
      userId: r.userId,
      icalUrl: r.icalUrl ?? undefined,
      credentialsPresent: !!r.credentialRef,
    }))

  const outcomes = await syncAllConnections(domain)
  revalidatePath('/channels-sync')
  return { ranAt: new Date().toISOString(), outcomes }
}

// The availability change history for one reservation (checkout moved, status
// flipped, etc.), newest first. Money is audited separately and never here.
export async function getReservationChanges(
  channel: ChannelId,
  externalBookingId: string,
): Promise<{ field: string; oldValue: string | null; newValue: string | null; changedAt: string }[]> {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(changeLog)
    .where(
      and(
        eq(changeLog.userId, userId),
        eq(changeLog.channel, channel),
        eq(changeLog.externalBookingId, externalBookingId),
      ),
    )
    .orderBy(desc(changeLog.changedAt))
    .limit(50)
  return rows.map((r) => ({
    field: r.field,
    oldValue: r.oldValue,
    newValue: r.newValue,
    changedAt: r.changedAt.toISOString(),
  }))
}
