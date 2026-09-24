-- Channel-sync layer migration. Additive only: six new tables that stand
-- alongside the live `booking`/`feed` tables. The single cross-reference is
-- `property` (existing units). Safe to re-run — everything is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "channel_connection" (
  "id" serial PRIMARY KEY,
  "userId" text NOT NULL,
  "propertyId" integer NOT NULL REFERENCES "property"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "icalUrl" text,
  "status" text NOT NULL DEFAULT 'awaiting_credentials',
  "credentialRef" text,
  "lastAttemptAt" timestamp,
  "lastSyncedAt" timestamp,
  "lastStatus" text,
  "lastError" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "channel_connection_property_channel_idx"
  ON "channel_connection" ("propertyId", "channel");

CREATE TABLE IF NOT EXISTS "reservation" (
  "id" serial PRIMARY KEY,
  "userId" text NOT NULL,
  "propertyId" integer NOT NULL REFERENCES "property"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "externalBookingId" text NOT NULL,
  "guestName" text,
  "checkIn" text NOT NULL,
  "checkOut" text NOT NULL,
  "status" text NOT NULL DEFAULT 'confirmed',
  "raw" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_channel_booking_idx"
  ON "reservation" ("channel", "externalBookingId");
CREATE INDEX IF NOT EXISTS "reservation_property_idx"
  ON "reservation" ("propertyId");

CREATE TABLE IF NOT EXISTS "financial_breakdown" (
  "id" serial PRIMARY KEY,
  "userId" text NOT NULL,
  "channel" text NOT NULL,
  "externalBookingId" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'ZAR',
  "grossAmount" integer NOT NULL DEFAULT 0,
  "channelCommission" integer NOT NULL DEFAULT 0,
  "cleaningFee" integer NOT NULL DEFAULT 0,
  "taxAmount" integer NOT NULL DEFAULT 0,
  "netPayout" integer NOT NULL DEFAULT 0,
  "source" text NOT NULL DEFAULT 'manual',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "financial_breakdown_channel_booking_idx"
  ON "financial_breakdown" ("channel", "externalBookingId");

CREATE TABLE IF NOT EXISTS "nightly_rate" (
  "id" serial PRIMARY KEY,
  "userId" text NOT NULL,
  "propertyId" integer NOT NULL REFERENCES "property"("id") ON DELETE CASCADE,
  "date" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'ZAR',
  "amount" integer NOT NULL DEFAULT 0,
  "source" text NOT NULL DEFAULT 'manual',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "nightly_rate_property_date_idx"
  ON "nightly_rate" ("propertyId", "date");

CREATE TABLE IF NOT EXISTS "change_log" (
  "id" serial PRIMARY KEY,
  "userId" text NOT NULL,
  "channel" text NOT NULL,
  "externalBookingId" text NOT NULL,
  "field" text NOT NULL,
  "oldValue" text,
  "newValue" text,
  "changedAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "change_log_booking_idx"
  ON "change_log" ("channel", "externalBookingId");

CREATE TABLE IF NOT EXISTS "channel_audit_log" (
  "id" serial PRIMARY KEY,
  "userId" text,
  "channel" text NOT NULL,
  "action" text NOT NULL,
  "detail" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "channel_audit_log_channel_idx"
  ON "channel_audit_log" ("channel");
CREATE INDEX IF NOT EXISTS "channel_audit_log_created_idx"
  ON "channel_audit_log" ("createdAt" DESC);

-- Per-site fee rule (added 2026-09-24 for manual reservation pricing). One row
-- per (property, channel); percentages are basis points. Additive + IF NOT
-- EXISTS, FK only to existing `property`.
CREATE TABLE IF NOT EXISTS "channel_pricing_rule" (
  "id" serial PRIMARY KEY,
  "userId" text NOT NULL,
  "propertyId" integer NOT NULL REFERENCES "property"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'ZAR',
  "commissionBps" integer NOT NULL DEFAULT 0,
  "vatBps" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "channel_pricing_rule_property_channel_idx"
  ON "channel_pricing_rule" ("propertyId", "channel");
