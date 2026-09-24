// NightsBridge adapter — STUB. NightsBridge exposes bookings and rates through
// their BridgeIT / partner API, which requires a partner key issued per
// property/agent. Until that exists this adapter reports not-ready and throws,
// rather than pretending a connection succeeded.
//
// To make it real: implement `fetch` against the NightsBridge API, returning
// Reservations plus FinancialBreakdowns (rate, commission). The
// `financials: true` capability means the engine will accept that money once
// you return it. Nothing else in the system changes.

import { AwaitingCredentialsError, type ChannelAdapter, type ChannelConnection, type ChannelSyncResult } from './types'

const PARTNER_REQUIREMENT = 'NightsBridge partner API key (BridgeIT) provisioned for the property'

export const nightsbridgeAdapter: ChannelAdapter = {
  channel: 'NIGHTSBRIDGE',
  displayName: 'NightsBridge',
  capabilities: { availability: true, financials: true },

  isReady(connection: ChannelConnection): boolean {
    return connection.credentialsPresent
  },

  async fetch(_connection: ChannelConnection): Promise<ChannelSyncResult> {
    throw new AwaitingCredentialsError('NIGHTSBRIDGE', PARTNER_REQUIREMENT)
  },
}
