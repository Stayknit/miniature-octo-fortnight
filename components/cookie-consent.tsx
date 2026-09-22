'use client'

import { Analytics } from '@vercel/analytics/next'
import Link from 'next/link'
import { useEffect, useState } from 'react'

// Cookie/consent notice (report #12). Non-essential tracking (Vercel Analytics)
// must not fire until the visitor accepts, so Analytics is mounted here only
// after consent — never unconditionally in the root layout. Essential auth
// cookies are unaffected; they're strictly necessary and need no consent.
const COOKIE = 'sk_consent'
type Choice = 'unknown' | 'accepted' | 'declined'

function readChoice(): Choice {
  if (typeof document === 'undefined') return 'unknown'
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`))
  const value = match?.split('=')[1]
  return value === 'accepted' || value === 'declined' ? value : 'unknown'
}

function persist(choice: Exclude<Choice, 'unknown'>) {
  // 1-year, lax, path-wide. Not HttpOnly by design — it's a UI preference.
  document.cookie = `${COOKIE}=${choice}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`
}

export function CookieConsent({ analyticsEnabled }: { analyticsEnabled: boolean }) {
  // Start 'unknown' but keep the banner hidden until mounted, so SSR and the
  // first client paint match (no hydration mismatch) and the banner only
  // appears once we've read the existing cookie.
  const [choice, setChoice] = useState<Choice>('unknown')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setChoice(readChoice())
    setMounted(true)
  }, [])

  function decide(next: Exclude<Choice, 'unknown'>) {
    persist(next)
    setChoice(next)
  }

  return (
    <>
      {analyticsEnabled && choice === 'accepted' && <Analytics />}

      {mounted && choice === 'unknown' && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex w-full max-w-xl flex-col gap-3 rounded-xl border border-border-strong bg-surface-2 p-4 shadow-2xl sm:flex-row sm:items-center">
            <p className="flex-1 text-[12px] leading-relaxed text-muted-foreground">
              We use essential cookies to keep you signed in, and — only with your consent — privacy-friendly analytics
              to improve StayKnit. See our{' '}
              <Link href="/cookie-policy" className="font-medium text-primary hover:underline">
                Cookie Policy
              </Link>
              .
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => decide('declined')}
                className="mono-label flex-1 rounded-md border border-border px-3 py-2.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground sm:flex-none"
              >
                Decline
              </button>
              <button
                onClick={() => decide('accepted')}
                className="mono-label flex-1 rounded-md bg-primary px-4 py-2.5 text-[10px] text-primary-foreground transition-opacity hover:opacity-90 sm:flex-none"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
