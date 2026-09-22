import { NextResponse } from 'next/server'

// Digital Asset Links — proves the StayKnit Android app (a Trusted Web Activity)
// is allowed to open stayknit.org without the browser address bar. Google
// fetches this file at https://stayknit.org/.well-known/assetlinks.json during
// TWA verification and at install time.
//
// Fill these in once (Project → Settings → Vars) from the values PWABuilder /
// Bubblewrap generate when you build the Android package:
//   ANDROID_PACKAGE_NAME       e.g. "org.stayknit.twa"
//   ANDROID_CERT_FINGERPRINTS  SHA-256 fingerprint(s), comma-separated.
// Include BOTH your upload key AND the Play App Signing key fingerprint (Google
// re-signs your app), otherwise verification fails on installs from the Store.

export const dynamic = 'force-dynamic'

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim()
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean)

  const statements =
    packageName && fingerprints.length > 0
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : []

  return NextResponse.json(statements, {
    headers: {
      'Content-Type': 'application/json',
      // Google re-fetches periodically; a short cache keeps updates quick.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
