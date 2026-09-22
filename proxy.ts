import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// StayKnit's single canonical public host. Everything else that resolves to the
// live production deployment — the auto-generated *.vercel.app URL and the bare
// apex stayknit.org — is 308-redirected here so there is exactly one indexable,
// cookie-bearing origin (matches sitemap/robots/metadataBase and the auth base
// URL).
const CANONICAL_HOST = 'www.stayknit.org'

// Tag any response served from a non-canonical *.vercel.app host as noindex so
// search engines never index a duplicate of the site under an auto-generated
// URL (preview builds, the staging branch alias, or the raw production alias).
// The canonical www host is never tagged.
function withNoindexIfVercelApp(response: NextResponse, host: string | null) {
  if (host && host.endsWith('.vercel.app')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }
  return response
}

export function proxy(request: NextRequest) {
  const host = request.headers.get('host')

  // Only enforce the canonical host on the real production deployment. Preview
  // and staging deployments keep their own hostnames — but we still stamp
  // noindex on any *.vercel.app response below so they stay out of search.
  if (process.env.VERCEL_ENV !== 'production') {
    return withNoindexIfVercelApp(NextResponse.next(), host)
  }

  // On production, the canonical host serves normally.
  if (!host || host === CANONICAL_HOST) {
    return NextResponse.next()
  }

  // Only redirect safe, idempotent navigations. POST/PUT/etc. (server actions,
  // form posts) are left alone so a redirect can never drop a request body —
  // by the time a user submits anything they've already landed on the canonical
  // host via the initial GET redirect. Non-GET requests to a non-canonical host
  // still get noindex in case a crawler probes them.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return withNoindexIfVercelApp(NextResponse.next(), host)
  }

  const url = request.nextUrl.clone()
  url.host = CANONICAL_HOST
  url.protocol = 'https:'
  url.port = ''
  // A 308 already keeps the source URL out of the index, and the noindex tag on
  // the redirect response reinforces it for the raw production *.vercel.app alias.
  return withNoindexIfVercelApp(NextResponse.redirect(url, 308), host)
}

export const config = {
  // Skip API routes (cron jobs, the Paystack webhook, and Better Auth all live
  // under /api and must keep working on whatever host invokes them), Next
  // internals, and common static assets. Only human-facing pages are canonicalised.
  //
  // Search-engine site-ownership files (Google's google<token>.html, Bing's
  // BingSiteAuth.xml) are also excluded: those verifiers fetch the file on the
  // exact host you registered and do NOT follow redirects, so the canonical 308
  // would break verification for the apex or *.vercel.app property. Leaving them
  // out lets the file serve a direct 200 on every host.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|google[a-z0-9]+\\.html|BingSiteAuth.xml).*)',
  ],
}
