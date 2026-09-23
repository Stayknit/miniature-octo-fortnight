// Channel-agnostic domain models + the adapter contract every listing-site
// integration implements. The sync engine talks ONLY to this interface, so
// adding a real channel later is one new adapter file — nothing else in the
// system changes.
//
// The single most important design decision here: availability (dates/status)
// and money (FinancialBreakdown) are SEPARATE models with SEPARATE capability
// flags. An availability-only adapter (iCal) is structurally incapable of
// carrying a price, and the engine drops+audits any financial data from an
// adapter that has not declared the `financials` capability. That is what makes
// "the iCal path can never invent a booking price" a guarantee, not a promise.

export type ChannelId = 'ICAL' | 'BOOKING_COM' | 'AIRBNB' | 'LEKKERSLAAP' | 'NIGHTSBRIDGE'

export type ReservationStatus = 'confirmed' | 'tentative' | 'cancelled' | 'block'

// Where a financial figure came from. Never inferred, always attributed, so a
// statement can show whether a payout is authoritative (channel API), entered
// by the host, or estimated from a nightly rate.
export type FinancialSource = 'channel_api' | 'manual' | 'nightly_rate'

// The availability facts an adapter may bring in. iCal-class feeds carry dates
// + status only; there is deliberately NO money field on this model.
export interface Reservation {
  channel: ChannelId
  /** Stable per-channel identity: VEVENT UID for iCal, OTA reservation id for APIs. */
  externalBookingId: string
  /** FK -> the existing `property` table. */
  propertyId: number
  /** Owner of the workspace this reservation belongs to (per-user scoping, no RLS). */
  userId: string
  guestName: string | null
  /** yyyy-mm-dd (inclusive check-in day). */
  checkIn: string
  /** yyyy-mm-dd (exclusive checkout day). */
  checkOut: string
  status: ReservationStatus
  /** Adapter-specific source payload, retained for audit/debugging only. */
  raw?: unknown
}

// Money is its own model, only ever written by an adapter that exposes a real
// financial API, by the host by hand, or estimated from a nightly rate. Amounts
// are in the currency's MINOR units (e.g. ZAR cents) for exactness.
export interface FinancialBreakdown {
  channel: ChannelId
  externalBookingId: string
  /** ISO 4217, e.g. 'ZAR'. */
  currency: string
  /** Total the guest paid, minor units. */
  grossAmount: number
  /** Channel/OTA commission withheld, minor units. */
  channelCommission: number
  /** Cleaning fee component, minor units. */
  cleaningFee: number
  /** Tax/VAT component, minor units. */
  taxAmount: number
  /** What the host actually receives, minor units. */
  netPayout: number
  source: FinancialSource
}

// What an adapter can do. The engine enforces these: a false flag means the
// engine will refuse (and audit) data of that kind even if the adapter returns
// it, so a capability can never be silently exceeded.
export interface ChannelCapabilities {
  /** Can supply reservation dates + status. */
  readonly availability: boolean
  /** Can supply authoritative money (gross/commission/payout). */
  readonly financials: boolean
}

// A configured link between one property and one channel. Credentials are never
// stored in code or in this object — only a reference/flag — so an adapter can
// report readiness without secrets leaking into the domain layer.
export interface ChannelConnection {
  channel: ChannelId
  propertyId: number
  userId: string
  /** iCal feed URL for the ICAL adapter; unused by API adapters. */
  icalUrl?: string
  /** True once the operator has provisioned real API credentials for this channel. */
  credentialsPresent: boolean
  /** Opaque, adapter-defined config (never raw secrets). */
  config?: Record<string, unknown>
}

export interface ChannelSyncResult {
  reservations: Reservation[]
  /** Empty unless the adapter declares (and possesses) the `financials` capability. */
  financials: FinancialBreakdown[]
}

// The one contract. Implement this to add a channel.
export interface ChannelAdapter {
  readonly channel: ChannelId
  readonly displayName: string
  readonly capabilities: ChannelCapabilities
  /**
   * Whether this adapter can run for the given connection RIGHT NOW. iCal is
   * ready as soon as it has a URL; API adapters stay not-ready until real
   * credentials exist. The engine SKIPS (never fakes) a not-ready adapter.
   */
  isReady(connection: ChannelConnection): boolean
  /** Pull the current state from the channel. Throws AwaitingCredentialsError if unusable. */
  fetch(connection: ChannelConnection): Promise<ChannelSyncResult>
}

// Thrown by an API adapter that has no real partner access yet. The engine
// catches this specifically and records an honest "skipped" outcome rather than
// letting it look like a failed or successful sync.
export class AwaitingCredentialsError extends Error {
  constructor(
    public readonly channel: ChannelId,
    /** The concrete partner milestone required, surfaced to operators. */
    public readonly partnerRequirement: string,
  ) {
    super(`${channel} adapter is awaiting API credentials: ${partnerRequirement}`)
    this.name = 'AwaitingCredentialsError'
  }
}

// The result of syncing one connection, returned by the engine so callers/crons
// can log and surface status without re-deriving it.
export interface SyncOutcome {
  channel: ChannelId
  propertyId: number
  skipped: boolean
  /** Present when skipped: why (e.g. 'awaiting_credentials', 'not_configured'). */
  reason?: string
  reservationsUpserted: number
  reservationsChanged: number
  financialsUpserted: number
  error?: string
}
