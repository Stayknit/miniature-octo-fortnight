import { getData, getOwnerData } from '@/app/actions/stayknit'
import { PortalSwitcher } from '@/components/portal-switcher'
import { LandingPage } from '@/components/marketing/landing-page'
import { auth } from '@/lib/auth'
import { resolvePaymentModeWarning } from '@/lib/payment-mode'
import { headers } from 'next/headers'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  // Logged-out visitors get the public marketing site; authenticated users fall
  // through to their portal below.
  if (!session?.user) return <LandingPage />

  const role = (session.user as { role?: string }).role ?? 'host'
  const user = { name: session.user.name, email: session.user.email }

  // Two-factor authentication is optional (but recommended) for every role —
  // hosts and owners alike. It is offered and encouraged in Settings; no role
  // is gated on it here.

  // Owner accounts are locked to their own portal — they never load the host
  // workspace and cannot switch views. Their data is scoped to their host's
  // units on the server.
  if (role === 'owner') {
    const ownerData = await getOwnerData()
    return <PortalSwitcher ownerData={ownerData} user={user} defaultView="owner" canSwitch={false} />
  }

  // Hosts load both views: the host portal plus a preview of their own owner
  // portal (both read the same workspace, so actions round-trip). The Paystack
  // key mode is checked server-side and surfaced as a host-only banner.
  const [data, ownerData, paymentWarning] = await Promise.all([
    getData(),
    getOwnerData(),
    resolvePaymentModeWarning(),
  ])
  return (
    <PortalSwitcher
      data={data}
      ownerData={ownerData}
      user={user}
      defaultView="host"
      canSwitch
      paymentWarning={paymentWarning}
    />
  )
}
