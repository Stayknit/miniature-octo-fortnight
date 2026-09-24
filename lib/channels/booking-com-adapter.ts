// Booking.com adapter — STUB. Booking.com reservations (including money) come
// from their Connectivity APIs, which require certification as a Connectivity
// Partner and per-property credentials. Until those exist this adapter is
// honest: it reports not-ready and throws rather than faking a connection or a
// zero-value booking.
//
// To make it real: implement `fetch` against the Reservations API, mapping each
// reservation to a Reservation and (because we ARE a financial-capable channel)
// a FinancialBreakdown. Declaring `financials: true` here is a promise the
// engine will hold you to — it will accept money from this adapter once fetch
// returns it. Nothing else in the system changes.

import { AwaitingCredentialsError, type ChannelAdapter, type ChannelConnection, type ChannelSyncResult } from './types'

const PARTNER_REQUIREMENT =
  'Booking.com Connectivity Partner certification + property-level API credentials'

export const bookingComAdapter: ChannelAdapter = {
  channel: 'BOOKING_COM',
  displayName: 'Booking.com',
  capabilities: { availability: true, financials: true },

  isReady(connection: ChannelConnection): boolean {
    // Never ready until real credentials are provisioned for this property.
    return connection.credentialsPresent
  },

  async fetch(_connection: ChannelConnection): Promise<ChannelSyncResult> {
    throw new AwaitingCredentialsError('BOOKING_COM', PARTNER_REQUIREMENT)
  },
}
