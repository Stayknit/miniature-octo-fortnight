import { withSentryConfig } from '@sentry/nextjs/config'

// Defense-in-depth response headers. These apply on the deployed app; the v0
// chat preview strips framing/CSP so the app still renders in the iframe.
//
// The CSP is now ENFORCING (report #14). The third-party surface is small and
// known, so the allowlist is explicit:
//   - Fonts: next/font/google self-hosts at build time, so 'self' covers them.
//   - Paystack inline checkout: js.paystack.co (script), checkout.paystack.com
//     (popup iframe), api.paystack.co + checkout.paystack.com for XHR.
//   - Vercel Analytics: served same-origin from /_vercel/insights, so 'self'.
// 'unsafe-inline' stays on script/style because Next emits inline hydration
// scripts and inline styles; a nonce would be the stricter follow-up.
//
// 'unsafe-eval' is added to script-src in DEVELOPMENT ONLY: React's dev build
// uses eval() for debugging features (e.g. reconstructing call stacks), and the
// Next dev server / HMR relies on it too. React never uses eval() in production,
// so the deployed CSP stays strict without it.
const isDev = process.env.NODE_ENV !== 'production'
const scriptSrc = ["script-src 'self' 'unsafe-inline' https://js.paystack.co", isDev ? "'unsafe-eval'" : '']
  .filter(Boolean)
  .join(' ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // This app has authenticated, state-changing UI, so disallow off-origin framing.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      scriptSrc,
      "frame-src 'self' https://checkout.paystack.com https://js.paystack.co",
      "connect-src 'self' https://api.paystack.co https://checkout.paystack.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join('; '),
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  // The admin "Docs" tab reads the markdown/.docx files under docs/ at runtime
  // via fs. Those files aren't imported anywhere, so file tracing wouldn't
  // bundle them into the serverless functions by default — include them
  // explicitly for the admin routes that read them.
  outputFileTracingIncludes: {
    '/admin/support': ['./docs/**/*'],
    '/api/admin/docs/[slug]': ['./docs/**/*'],
    '/admin/docs/[slug]/print': ['./docs/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // Canonicalize the domain: send the bare apex (stayknit.org) to the www host
  // that metadataBase/openGraph already treat as canonical. Host-gated, so it
  // never fires on Vercel preview URLs or localhost, and can't loop because the
  // destination host (www) differs from the matched source host (apex).
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'stayknit.org' }],
        destination: 'https://www.stayknit.org/:path*',
        permanent: true,
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  // Org/project come from env so nothing is hardcoded; when unset, source-map
  // upload is simply skipped and runtime error capture still works.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Auth token enables readable stack traces via source-map upload at build
  // time. Keep it out of the repo — set it in the Vercel project env.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only log source-map upload output in CI.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Route browser events through a same-origin path. This keeps them within
  // the app's enforcing CSP (connect-src 'self') and dodges ad-blockers, so we
  // don't have to widen connect-src to the Sentry ingest domain.
  tunnelRoute: '/monitoring',
  // Tree-shake Sentry's internal debug logging from the client bundle in
  // production (replaces the deprecated `disableLogger` option).
  treeshake: {
    removeDebugLogging: true,
  },
})
