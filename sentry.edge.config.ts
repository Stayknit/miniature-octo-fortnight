import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// Shares the server-side SENTRY_TRACES_SAMPLE_RATE (0..1); full traces in dev,
// 10% default in prod. See sentry.server.config.ts for rationale.
const tracesSampleRate =
  process.env.NODE_ENV === 'development' ? 1.0 : parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1)

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate,
    ignoreErrors: ['NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
    enabled: process.env.NODE_ENV === 'production',
  })
}

function parseSampleRate(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback
}
