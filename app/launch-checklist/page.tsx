import { notFound } from 'next/navigation'
import { getAdmin } from '@/lib/admin-auth'
import { getLaunchOverrides } from '@/app/actions/launch-checklist'
import { LaunchChecklistView } from '@/components/launch-checklist-view'

export const dynamic = 'force-dynamic'

export default async function LaunchChecklistPage() {
  const admin = await getAdmin()
  if (!admin) notFound()

  const initialOverrides = await getLaunchOverrides()

  return <LaunchChecklistView initialOverrides={initialOverrides} />
}
