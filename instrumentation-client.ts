import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// Browser tracing rate. Must use a NEXT_PUBLIC_ var so it's inlined into the
// client bundle at build time; full traces in dev, 10% default in prod.
const tracesSampleRate =
  process.env.NODE_ENV === 'development'
    ? 1.0
    : parseSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0.1)

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate,
    // Session Replay is intentionally omitted: it records user sessions, which
    // adds bundle weight and raises POPIA/privacy considerations for a
    // property-management app handling guest data. Add it deliberately later
    // if wanted, with masking enabled.
    ignoreErrors: ['NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
    enabled: process.env.NODE_ENV === 'production',
  })
}

// Instrument App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

// Parse a 0..1 sample rate from an env string, falling back for
// missing/invalid/out-of-range values so a typo can't silence tracing.
function parseSampleRate(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback
}
