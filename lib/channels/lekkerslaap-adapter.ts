// LekkerSlaap adapter — STUB. LekkerSlaap (a SafariNow brand) exposes
// reservation + rate data through their channel-manager API, which requires a
// partner agreement and API access. Until that exists this adapter reports
// not-ready and throws.
//
// Note: many hosts run LekkerSlaap over plain iCal today — for pure
// availability that path already works via the iCal adapter. This adapter is
// for the richer API (guest + financial detail) once access is granted.
//
// To make it real: implement `fetch` against the LekkerSlaap API and return
// Reservations plus FinancialBreakdowns. Nothing else in the system changes.

import { AwaitingCredentialsError, type ChannelAdapter, type ChannelConnection, type ChannelSyncResult } from './types'

const PARTNER_REQUIREMENT = 'LekkerSlaap / SafariNow channel-manager API access + partner credentials'

export const lekkerslaapAdapter: ChannelAdapter = {
  channel: 'LEKKERSLAAP',
  displayName: 'LekkerSlaap',
  capabilities: { availability: true, financials: true },

  isReady(connection: ChannelConnection): boolean {
    return connection.credentialsPresent
  },

  async fetch(_connection: ChannelConnection): Promise<ChannelSyncResult> {
    throw new AwaitingCredentialsError('LEKKERSLAAP', PARTNER_REQUIREMENT)
  },
}
