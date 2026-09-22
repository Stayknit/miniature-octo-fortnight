import type { Metadata } from 'next'
import { Wordmark } from '@/components/wordmark'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Offline · StayKnit',
  description: 'You are offline.',
  robots: { index: false, follow: false },
}

// Static, data-free fallback served by the service worker when a navigation
// fails offline. It deliberately contains NO personal data — the authenticated
// workspace is never cached, so there is nothing to show until the network is
// back.
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <Wordmark />
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="font-sans text-xl font-extrabold text-foreground">You&apos;re offline</h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          StayKnit needs a connection to load your calendar and bookings. Check your network and try again — nothing was
          lost.
        </p>
      </div>
      <a
        href="/"
        className="mono-label rounded-lg bg-primary px-4 py-2.5 text-[11px] text-primary-foreground transition-opacity hover:opacity-90"
      >
        Try again
      </a>
    </main>
  )
}
