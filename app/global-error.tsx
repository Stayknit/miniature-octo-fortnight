'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Catches errors thrown in the root layout itself. Route-level errors are
// handled by the nearer error.tsx boundaries; this is the last-resort shell,
// so it renders its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          background: '#0f172a',
          color: '#e2e8f0',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 20px', color: '#94a3b8' }}>
            StayKnit hit an unexpected error. Our team has been notified. Please try again — if it
            keeps happening, contact support@stayknit.org.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              appearance: 'none',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              background: '#14b8a6',
              color: '#042f2e',
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ fontSize: 11, marginTop: 16, color: '#64748b' }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  )
}
