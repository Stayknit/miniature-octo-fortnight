// Canonical public origin for building absolute links in emails and server code
// (e.g. the hosted receipt link). Mirrors the resolution used by the auth base
// URL and the renewals cron so every link points at the same deployment.
export function siteOrigin(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  // On the live production deployment always use the canonical www host, so
  // emailed links (receipts, verification, reset) never point at the apex or
  // the auto-generated *.vercel.app URL.
  if (process.env.VERCEL_ENV === 'production') return 'https://www.stayknit.org'
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://www.stayknit.org'
}

// Absolute URL to a host's hosted receipt / tax invoice for a given Paystack
// transaction reference. The page itself is auth-gated and payer-scoped.
export function receiptUrlFor(reference: string): string {
  return `${siteOrigin()}/receipt/${encodeURIComponent(reference)}`
}
