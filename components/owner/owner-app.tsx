'use client'

import { AppShell, type TabDef } from '@/components/app-shell'
import { OwnerDashboard } from '@/components/owner/owner-dashboard'
import { OwnerCalendar } from '@/components/owner/owner-calendar'
import { OwnerCosts } from '@/components/owner/owner-costs'
import type { OwnerData } from '@/lib/types'
import { CalendarDays, Home, Wallet } from 'lucide-react'
import { useState } from 'react'

const TABS: TabDef[] = [
  { key: 'home', label: 'Overview', icon: <Home size={18} /> },
  { key: 'calendar', label: 'Calendar', icon: <CalendarDays size={18} /> },
  { key: 'costs', label: 'Statement', icon: <Wallet size={18} /> },
]

export function OwnerApp({
  data,
  user,
  view,
  onSwitchView,
}: {
  data: OwnerData
  user: { name: string; email: string }
  view?: 'host' | 'owner'
  onSwitchView?: (v: 'host' | 'owner') => void
}) {
  const [tab, setTab] = useState('home')

  // `data` is already scoped to this owner on the server: it contains only
  // their own record, their units, and their bookings. There is no path here
  // to another owner's details.
  const self = data.self ?? undefined
  const myBookings = data.bookings
  const myProperties = data.properties

  return (
    <AppShell
      user={user}
      roleLabel="Owner"
      tabs={TABS}
      active={tab}
      onSelect={setTab}
      view={view}
      onSwitchView={onSwitchView}
    >
      {tab === 'home' && (
        <OwnerDashboard
          self={self}
          bookings={myBookings}
          properties={myProperties}
          costLines={data.costLines}
          vat={data.vat}
          onNavigate={setTab}
        />
      )}
      {tab === 'calendar' && <OwnerCalendar bookings={myBookings} properties={myProperties} />}
      {tab === 'costs' && (
        <OwnerCosts self={self} bookings={myBookings} costLines={data.costLines} host={data.host} vat={data.vat} />
      )}
    </AppShell>
  )
}
