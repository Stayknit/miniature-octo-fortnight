// Airbnb adapter — STUB. Airbnb's reservation + payout APIs require approval as
// a Preferred/Software Partner and OAuth credentials per host account. Until
// then this adapter reports not-ready and throws, so a missing integration can
// never masquerade as an empty or free booking.
//
// To make it real: implement `fetch` against the Airbnb API, mapping each
// reservation to a Reservation plus a FinancialBreakdown (payout, host fee).
// The `financials: true` capability means the engine will accept that money
// once you return it. Nothing else in the system changes.

import { AwaitingCredentialsError, type ChannelAdapter, type ChannelConnection, type ChannelSyncResult } from './types'

const PARTNER_REQUIREMENT = 'Airbnb Preferred/Software Partner approval + per-account OAuth credentials'

export const airbnbAdapter: ChannelAdapter = {
  channel: 'AIRBNB',
  displayName: 'Airbnb',
  capabilities: { availability: true, financials: true },

  isReady(connection: ChannelConnection): boolean {
    return connection.credentialsPresent
  },

  async fetch(_connection: ChannelConnection): Promise<ChannelSyncResult> {
    throw new AwaitingCredentialsError('AIRBNB', PARTNER_REQUIREMENT)
  },
}
