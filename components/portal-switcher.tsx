'use client'

import { HostApp } from '@/components/host/host-app'
import { OwnerApp } from '@/components/owner/owner-app'
import { CurrencyProvider } from '@/components/currency-context'
import type { PaymentModeWarning } from '@/lib/payment-mode'
import type { OwnerData, StayKnitData } from '@/lib/types'
import { useState } from 'react'

export type PortalView = 'host' | 'owner'

// A single host account can view both sides of StayKnit. An owner login is
// locked to the owner portal (no host data is loaded for it).
export function PortalSwitcher({
  data,
  ownerData,
  user,
  defaultView,
  canSwitch,
  paymentWarning = null,
}: {
  data?: StayKnitData
  ownerData: OwnerData
  user: { name: string; email: string }
  defaultView: PortalView
  canSwitch: boolean
  paymentWarning?: PaymentModeWarning | null
}) {
  const [view, setView] = useState<PortalView>(defaultView)

  // Owners (canSwitch=false) never receive the switch handler, so the
  // Host/Owner toggle is hidden and they cannot reach the host portal.
  const onSwitchView = canSwitch ? setView : undefined

  // Owner view — also the only option when there's no host data (owner login).
  if (view === 'owner' || !data) {
    return (
      <CurrencyProvider value={ownerData.currency}>
        <OwnerApp data={ownerData} user={user} view={view} onSwitchView={onSwitchView} />
      </CurrencyProvider>
    )
  }
  return (
    <CurrencyProvider value={data.settings.currency}>
      <HostApp
        data={data}
        user={user}
        view={view}
        onSwitchView={onSwitchView}
        paymentWarning={paymentWarning}
      />
    </CurrencyProvider>
  )
}
