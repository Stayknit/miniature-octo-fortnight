'use client'

import Script from 'next/script'
import { useEffect, useRef } from 'react'

// Public config, all optional. Set these in Project Settings → Vars to switch
// from the fallback badge to the live TrustBox with real reviews:
//   NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID  (required for the live widget)
//   NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID       (TrustBox template, e.g. Micro Star)
//   NEXT_PUBLIC_TRUSTPILOT_DOMAIN            (your reviewed domain, e.g. stayknit.org)
//   NEXT_PUBLIC_TRUSTPILOT_LOCALE            (defaults to en-US)
const BUSINESS_UNIT_ID = process.env.NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID
// "Micro Star" template — compact, fits the auth screen. Override via env.
const TEMPLATE_ID = process.env.NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID || '5419b6a8b0d04a076446a9ad'
const DOMAIN = process.env.NEXT_PUBLIC_TRUSTPILOT_DOMAIN || 'stayknit.org'
const LOCALE = process.env.NEXT_PUBLIC_TRUSTPILOT_LOCALE || 'en-US'
// Some TrustBox templates (e.g. Review Collector) require a data-token.
const TOKEN = process.env.NEXT_PUBLIC_TRUSTPILOT_TOKEN
// TrustBox pixel height; Review Collector needs ~52px, Micro Star ~24px.
const HEIGHT = process.env.NEXT_PUBLIC_TRUSTPILOT_HEIGHT || '24px'
const PROFILE_URL = `https://www.trustpilot.com/review/${DOMAIN}`

declare global {
  interface Window {
    Trustpilot?: { loadFromElement: (el: HTMLElement | null, forceReload?: boolean) => void }
  }
}

export function TrustpilotTrustBox() {
  const ref = useRef<HTMLDivElement>(null)

  // Once the bootstrap script is present, ask Trustpilot to hydrate this
  // specific TrustBox. Safe to call again on remount.
  useEffect(() => {
    if (BUSINESS_UNIT_ID && window.Trustpilot) {
      window.Trustpilot.loadFromElement(ref.current, true)
    }
  }, [])

  if (!BUSINESS_UNIT_ID) {
    // Fallback until the Business account / Business Unit ID is ready. Links to
    // the public Trustpilot profile so it is useful immediately.
    return (
      <a
        href={PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 flex items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="See StayKnit reviews on Trustpilot"
      >
        <span className="mono-label text-[10px]">Reviewed on</span>
        <span className="text-sm font-semibold text-foreground">Trustpilot</span>
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} />
          ))}
        </span>
      </a>
    )
  }

  return (
    <>
      <Script
        src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"
        strategy="afterInteractive"
        onLoad={() => window.Trustpilot?.loadFromElement(ref.current, true)}
      />
      {/* Official Trustpilot TrustBox — hydrated by the script above. */}
      <div
        ref={ref}
        className="trustpilot-widget mt-8"
        data-locale={LOCALE}
        data-template-id={TEMPLATE_ID}
        data-businessunit-id={BUSINESS_UNIT_ID}
        data-style-height={HEIGHT}
        data-style-width="100%"
        data-theme="dark"
        {...(TOKEN ? { 'data-token': TOKEN } : {})}
      >
        <a href={PROFILE_URL} target="_blank" rel="noopener noreferrer">
          Trustpilot
        </a>
      </div>
    </>
  )
}

function Star() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--primary)" role="presentation">
      <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7L12 17.8 5.8 21.2l1.6-7L2 9.5l7.1-.6z" />
    </svg>
  )
}
