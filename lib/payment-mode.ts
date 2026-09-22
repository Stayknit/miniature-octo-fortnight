import 'server-only'

// Detects whether the app is configured with live or test Paystack keys, and how
// serious a mismatch is given the current deployment environment. This is the
// runtime guard behind the host-dashboard banner: test keys can never charge
// real customers, so shipping them to production is a launch blocker.

export type PaystackKeyMode = 'live' | 'test' | 'unknown' | 'missing'

export function paystackKeyMode(): PaystackKeyMode {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) return 'missing'
  if (key.startsWith('sk_live_')) return 'live'
  if (key.startsWith('sk_test_')) return 'test'
  return 'unknown'
}

// `VERCEL_ENV` is "production" only on the production deployment; it is
// "preview" for preview deployments and unset in local/v0 development.
export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === 'production'
}

export type PaymentModeWarning = {
  mode: PaystackKeyMode
  severity: 'critical' | 'notice'
  title: string
  detail: string
}

// Returns null when everything is correct (live keys), so the UI renders
// nothing. Otherwise returns a warning whose severity escalates to "critical"
// on the production deployment, where test keys mean customers cannot pay.
export function paymentModeWarning(): PaymentModeWarning | null {
  const mode = paystackKeyMode()
  if (mode === 'live') return null

  const prod = isProductionDeployment()
  const severity: PaymentModeWarning['severity'] = prod ? 'critical' : 'notice'

  if (mode === 'missing') {
    return {
      mode,
      severity,
      title: prod ? 'Payments are not configured' : 'Paystack key missing',
      detail: prod
        ? 'PAYSTACK_SECRET_KEY is not set on this deployment, so no payments can be taken. Add your live Paystack keys in Project Settings → Vars.'
        : 'PAYSTACK_SECRET_KEY is not set. Add it in Project Settings → Vars before launch.',
    }
  }

  if (mode === 'unknown') {
    return {
      mode,
      severity,
      title: 'Unrecognised Paystack key',
      detail:
        'PAYSTACK_SECRET_KEY does not look like a valid Paystack secret key (expected an sk_live_ or sk_test_ prefix). Double-check the value in Project Settings → Vars.',
    }
  }

  // mode === 'test'
  return {
    mode,
    severity,
    title: prod ? 'Paystack is in TEST mode — live payments are disabled' : 'Paystack is in test mode',
    detail: prod
      ? 'Real customers cannot be charged on the live site. Replace the test keys with your live Paystack keys (sk_live_ / pk_live_) in Project Settings → Vars before accepting subscriptions.'
      : 'This is expected in previews. Switch to live Paystack keys in Project Settings → Vars before you launch officially.',
  }
}

// Result of actually calling Paystack with the configured secret key. A key can
// have the right sk_live_ prefix yet still be rejected (401) — e.g. regenerated,
// or the account not fully activated for live — in which case real charges fail
// even though the prefix guard reads "live".
export type PaystackHealth = 'ok' | 'rejected' | 'unreachable'

type CachedHealth = { value: PaystackHealth; at: number }
let healthCache: CachedHealth | null = null
// Cache long enough to keep this off the hot path for normal navigation, short
// enough that a key fix is reflected within a few minutes without a redeploy.
const HEALTH_TTL_MS = 5 * 60 * 1000

// Pings an authenticated, read-only Paystack endpoint to prove the secret key
// works. Never throws: a network/timeout problem returns "unreachable" (we don't
// want a transient blip to raise a false launch-blocker), while an explicit 401
// returns "rejected". Cached in-memory with a short TTL.
export async function checkPaystackHealth(): Promise<PaystackHealth> {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) return 'rejected'

  const now = Date.now()
  if (healthCache && now - healthCache.at < HEALTH_TTL_MS) return healthCache.value

  let value: PaystackHealth
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch('https://api.paystack.co/balance', {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(timeout))

    if (res.status === 401) value = 'rejected'
    else if (res.ok) value = 'ok'
    // Any other status (e.g. 5xx) is treated as "can't verify" rather than a
    // definitive rejection, so we don't cry wolf on a Paystack-side hiccup.
    else value = 'unreachable'
  } catch {
    value = 'unreachable'
  }

  healthCache = { value, at: now }
  return value
}

// Async superset of paymentModeWarning(): first applies the fast prefix check,
// then — only when the prefix says "live" (so the sync guard would show nothing)
// — verifies the key actually authenticates. This closes the gap where a
// live-formatted-but-401 key produced a false "all clear".
export async function resolvePaymentModeWarning(): Promise<PaymentModeWarning | null> {
  const prefixWarning = paymentModeWarning()
  if (prefixWarning) return prefixWarning

  // Prefix says live and no warning — confirm the key is genuinely usable.
  const health = await checkPaystackHealth()
  if (health === 'ok') return null

  const prod = isProductionDeployment()
  if (health === 'rejected') {
    return {
      mode: 'live',
      severity: 'critical',
      title: 'Live Paystack key is being rejected',
      detail:
        'The key is live-formatted (sk_live_) but Paystack refuses it (401 Invalid key), so real customer charges would fail. Confirm the account is fully activated for live, regenerate the live keys in Paystack → Settings → API Keys & Webhooks, and paste the fresh sk_live_ / pk_live_ into Project Settings → Vars.',
    }
  }

  // health === 'unreachable' — surface a soft notice, and only on production
  // (locally/preview a blocked outbound call is common and not actionable).
  if (!prod) return null
  return {
    mode: 'live',
    severity: 'notice',
    title: 'Could not verify Paystack right now',
    detail:
      'The live key looks correct but Paystack did not respond to a verification check. This is usually a temporary network issue; if it persists, confirm the key in Project Settings → Vars.',
  }
}
