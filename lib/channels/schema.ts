// Drizzle schema for the channel-sync layer. These tables are additive and
// stand alongside the existing app schema — they do NOT replace the live
// `booking`/`feed` tables. The only cross-reference is `property`, imported
// from the existing schema so reservations FK to your real units.
//
// Nothing here is migrated automatically. See README-v0-prompt.md for how to
// generate + apply a migration when you decide to adopt this layer.

import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, integer, serial, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

// Point the properties import at the existing table — reservations belong to
// real units, and this keeps a single source of truth for properties.
import { property } from '@/lib/db/schema'

// A configured link between one property and one channel. `status` is the
// operator-facing health of the connection; `credentialRef` is an opaque
// pointer to secrets held elsewhere (env/secret manager), never the secret.
export const channelConnection = pgTable(
  'channel_connection',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    propertyId: integer('propertyId')
      .notNull()
      .references(() => property.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(), // ICAL | BOOKING_COM | AIRBNB | LEKKERSLAAP | NIGHTSBRIDGE
    icalUrl: text('icalUrl'),
    // active | awaiting_credentials | disabled | error
    status: text('status').notNull().default('awaiting_credentials'),
    credentialRef: text('credentialRef'),
    lastAttemptAt: timestamp('lastAttemptAt'),
    lastSyncedAt: timestamp('lastSyncedAt'),
    lastStatus: text('lastStatus'), // ok | skipped | error
    lastError: text('lastError'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (t) => ({
    // One connection per property per channel.
    propertyChannelIdx: uniqueIndex('channel_connection_property_channel_idx').on(t.propertyId, t.channel),
  }),
)

// A reservation mirrored from a channel. Availability facts only — no money
// column lives here by design (see financial_breakdown).
export const reservation = pgTable(
  'reservation',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    propertyId: integer('propertyId')
      .notNull()
      .references(() => property.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    externalBookingId: text('externalBookingId').notNull(),
    guestName: text('guestName'),
    checkIn: text('checkIn').notNull(), // yyyy-mm-dd
    checkOut: text('checkOut').notNull(), // yyyy-mm-dd exclusive
    status: text('status').notNull().default('confirmed'), // confirmed | tentative | cancelled | block
    raw: jsonb('raw'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (t) => ({
    // The idempotency key the sync engine upserts on. A channel's booking id is
    // globally unique per channel, so (channel, externalBookingId) identifies a
    // reservation across repeated syncs.
    channelBookingIdx: uniqueIndex('reservation_channel_booking_idx').on(t.channel, t.externalBookingId),
    propertyIdx: index('reservation_property_idx').on(t.propertyId),
  }),
)

// Money for a reservation, kept separate so an availability-only channel can
// never write it. Amounts are in the currency's MINOR units (e.g. ZAR cents).
export const financialBreakdown = pgTable(
  'financial_breakdown',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    channel: text('channel').notNull(),
    externalBookingId: text('externalBookingId').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    grossAmount: integer('grossAmount').notNull().default(0),
    channelCommission: integer('channelCommission').notNull().default(0),
    cleaningFee: integer('cleaningFee').notNull().default(0),
    taxAmount: integer('taxAmount').notNull().default(0),
    netPayout: integer('netPayout').notNull().default(0),
    source: text('source').notNull().default('manual'), // channel_api | manual | nightly_rate
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (t) => ({
    // One breakdown per reservation, keyed identically to the reservation so an
    // upsert can attach money to the exact stay.
    channelBookingIdx: uniqueIndex('financial_breakdown_channel_booking_idx').on(t.channel, t.externalBookingId),
  }),
)

// A per-date price for a property, used to ESTIMATE a reservation's value when
// no authoritative channel financials exist (source = 'nightly_rate'). Also the
// basis for a future rate-push once write APIs are available.
export const nightlyRate = pgTable(
  'nightly_rate',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    propertyId: integer('propertyId')
      .notNull()
      .references(() => property.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // yyyy-mm-dd
    currency: text('currency').notNull().default('ZAR'),
    amount: integer('amount').notNull().default(0), // minor units
    source: text('source').notNull().default('manual'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (t) => ({
    propertyDateIdx: uniqueIndex('nightly_rate_property_date_idx').on(t.propertyId, t.date),
  }),
)

// The host's saved fee structure for one unit on one booking site. Because each
// site withholds a different commission, the rule is keyed per (property,
// channel) and re-applied every time a host enters a reservation's gross amount
// — that is what makes manual pricing "permanent per booking site". Percentages
// are basis points (1500 = 15.00%); no money lives here (it drives the math in
// lib/channels/pricing.ts, which writes financial_breakdown).
export const channelPricingRule = pgTable(
  'channel_pricing_rule',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    propertyId: integer('propertyId')
      .notNull()
      .references(() => property.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    commissionBps: integer('commissionBps').notNull().default(0),
    vatBps: integer('vatBps').notNull().default(0),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (t) => ({
    // One rule per property per channel — the key the save action upserts on.
    propertyChannelIdx: uniqueIndex('channel_pricing_rule_property_channel_idx').on(t.propertyId, t.channel),
  }),
)

// An append-only record of every field a sync changed on a reservation. This is
// what lets the UI show "checkout moved from X to Y after the last Airbnb sync"
// and is limited to availability fields — money changes are audited separately.
export const changeLog = pgTable(
  'change_log',
  {
    id: serial('id').primaryKey(),
    userId: text('userId').notNull(),
    channel: text('channel').notNull(),
    externalBookingId: text('externalBookingId').notNull(),
    field: text('field').notNull(), // guestName | checkIn | checkOut | status
    oldValue: text('oldValue'),
    newValue: text('newValue'),
    changedAt: timestamp('changedAt').notNull().defaultNow(),
  },
  (t) => ({
    bookingIdx: index('change_log_booking_idx').on(t.channel, t.externalBookingId),
  }),
)

// A broader operational audit trail: skipped adapters, dropped financial data,
// sync errors. Distinct from change_log (which is about reservation content) —
// this is about the system's own decisions, and is where the "we refused to
// fake it" evidence lives.
export const auditLog = pgTable(
  'channel_audit_log',
  {
    id: serial('id').primaryKey(),
    userId: text('userId'),
    channel: text('channel').notNull(),
    // e.g. skipped_awaiting_credentials | financials_dropped | sync_error | sync_ok
    action: text('action').notNull(),
    detail: jsonb('detail'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (t) => ({
    channelIdx: index('channel_audit_log_channel_idx').on(t.channel),
    createdAtIdx: index('channel_audit_log_created_idx').on(sql`${t.createdAt} DESC`),
  }),
)
