import { NextResponse } from 'next/server'

// Apple Pay domain verification for Paystack.
//
// To enable Apple Pay in the Paystack checkout, Paystack (on Apple's behalf)
// fetches a domain-association token at:
//   https://<your-domain>/.well-known/apple-developer-merchantid-domain-association
// and compares it byte-for-byte with the file you downloaded in the Paystack
// dashboard (Settings → Apple Pay → "Download verification file").
//
// The token is merchant-specific and cannot be generated here. Paste the FULL
// contents of that downloaded file into this env var (Project → Settings → Vars):
//   PAYSTACK_APPLE_PAY_DOMAIN_ASSOCIATION
// then click "Verify domain" in Paystack. It is served on whatever host hits the
// app, so both the apex (stayknit.org) and www.stayknit.org resolve it.
//
// Next.js does not reliably serve dotfolders from public/, so — like
// assetlinks.json — this is a route handler rather than a static file.

export const dynamic = 'force-dynamic'

export function GET() {
  const token = process.env.PAYSTACK_APPLE_PAY_DOMAIN_ASSOCIATION?.trim()

  // Not configured yet: 404 so an unverified state is obvious, rather than
  // serving an empty 200 that would fail verification with no clue why.
  if (!token) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new NextResponse(token, {
    status: 200,
    headers: {
      // Paystack requires exactly "application/text" — any other content-type
      // fails verification and can break Apple Pay payments.
      'Content-Type': 'application/text',
      // Apple/Paystack re-fetch on verification and periodically after.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
