import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getChannelSyncData } from '@/app/actions/channels-sync'
import { ChannelSyncDashboard } from '@/components/channels/channel-sync-dashboard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Channel sync · StayKnit',
  description: 'Connect listing-site calendars and review imported reservations.',
}

export default async function ChannelsSyncPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const data = await getChannelSyncData()
  return <ChannelSyncDashboard data={data} />
}
