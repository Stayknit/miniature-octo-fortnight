'use client'

import { useEffect } from 'react'

// Registers the service worker after load so it never blocks first paint.
// Only runs in production builds — the dev server serves a different bundle
// and a stale SW there causes confusing cache behavior.
export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failure is non-fatal; the app still works online.
      })
    }
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  return null
}
