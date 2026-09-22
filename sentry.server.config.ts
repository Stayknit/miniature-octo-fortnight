import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// Trace sampling is env-tunable so you can raise it at launch (low traffic ->
// sample more to actually see traces) and dial it back as volume grows, all
// without a code deploy. Full traces in dev; SENTRY_TRACES_SAMPLE_RATE (0..1)
// in prod, defaulting to 10%.
const tracesSampleRate =
  process.env.NODE_ENV === 'development' ? 1.0 : parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1)

// Only initialize when a DSN is configured, so local/dev and unconfigured
// environments stay silent no-ops instead of erroring or spamming Sentry.
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate,
    // Don't report the noisy, expected errors we already handle in-app.
    ignoreErrors: ['NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
    enabled: process.env.NODE_ENV === 'production',
  })
}

// Parse a 0..1 sample rate from an env string, falling back to `fallback` for
// missing/invalid/out-of-range values so a typo can never silence tracing or
// send 100% by accident.
function parseSampleRate(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback
}
