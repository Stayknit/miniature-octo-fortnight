'use client'

import { AppShell, type TabDef } from '@/components/app-shell'
import { TodayScreen } from '@/components/host/today-screen'
import { CalendarScreen } from '@/components/host/calendar-screen'
import { ChannelsScreen } from '@/components/host/channels-screen'
import { OwnersScreen } from '@/components/host/owners-screen'
import { PlanScreen } from '@/components/host/plan-screen'
import { TrialExpiredGate } from '@/components/host/trial-expired-gate'
import { RenewalReminder } from '@/components/host/renewal-reminder'
import { TrialEndingReminder } from '@/components/host/trial-ending-reminder'
import { TermsGate } from '@/components/terms-gate'
import { isExpiringSoon, isTrialEndingSoon, isTrialExpired } from '@/lib/plans'
import { PaymentModeBanner } from '@/components/payment-mode-banner'
import type { PaymentModeWarning } from '@/lib/payment-mode'
import type { StayKnitData } from '@/lib/types'
import { CalendarDays, CreditCard, Home, Radio, Users } from 'lucide-react'
import { useState } from 'react'

const TABS: TabDef[] = [
  { key: 'today', label: 'Today', icon: <Home size={18} /> },
  { key: 'calendar', label: 'Calendar', icon: <CalendarDays size={18} /> },
  { key: 'channels', label: 'Channels', icon: <Radio size={18} /> },
  { key: 'owners', label: 'Finances', icon: <Users size={18} /> },
  { key: 'plan', label: 'Plan', icon: <CreditCard size={18} /> },
]

export function HostApp({
  data,
  user,
  view,
  onSwitchView,
  paymentWarning = null,
}: {
  data: StayKnitData
  user: { name: string; email: string }
  view?: 'host' | 'owner'
  onSwitchView?: (v: 'host' | 'owner') => void
  paymentWarning?: PaymentModeWarning | null
}) {
  const [tab, setTab] = useState('today')

  // Hosts must accept the relay terms once before using the app.
  if (!data.subscription.termsAcceptedAt) {
    return <TermsGate user={user} />
  }

  // When the free trial has lapsed (and no paid term covers them), the whole
  // app freezes behind a non-dismissible subscribe overlay.
  const trialExpired = isTrialExpired(data.subscription)
  // A paid term ending soon shows a dismissible renewal nudge (access continues).
  const expiringSoon = !trialExpired && isExpiringSoon(data.subscription)
  // A live trial ending soon shows a dismissible "choose a plan" nudge (trial
  // access continues until it lapses, at which point the freeze gate takes over).
  const trialEndingSoon = !trialExpired && isTrialEndingSoon(data.subscription)

  return (
    <>
      <AppShell
        user={user}
        roleLabel="Host"
        tabs={TABS}
        active={tab}
        onSelect={setTab}
          settings={data.settings}
          view={view}
        onSwitchView={onSwitchView}
        showViewSwitch={tab === 'owners'}
      >
        <PaymentModeBanner warning={paymentWarning} />
        {tab === 'today' && <TodayScreen data={data} onNavigate={setTab} />}
        {tab === 'calendar' && <CalendarScreen data={data} />}
        {tab === 'channels' && <ChannelsScreen data={data} />}
        {tab === 'owners' && <OwnersScreen data={data} user={user} />}
        {tab === 'plan' && <PlanScreen data={data} />}
      </AppShell>

      {trialExpired && <TrialExpiredGate data={data} />}
      {expiringSoon && <RenewalReminder data={data} />}
      {trialEndingSoon && <TrialEndingReminder data={data} onChoosePlan={() => setTab('plan')} />}
    </>
  )
}
