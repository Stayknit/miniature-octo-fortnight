import { headers } from 'next/headers'
import { DEFAULT_CURRENCY, type CurrencyCode } from '@/lib/pricing'

// Countries that bill in the Euro (eurozone members + microstates that use it).
const EUROZONE = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
  'AD', 'MC', 'SM', 'VA', 'ME', 'XK',
])

// Map an ISO-3166 alpha-2 country to the currency StayKnit bills that region in.
// This is the anti-arbitrage source of truth: a subscriber is charged the rate
// for where they actually are, never a cheaper currency they picked themselves.
export function countryToCurrency(country: string | null | undefined): CurrencyCode {
  const c = (country ?? '').toUpperCase()
  if (!c) return DEFAULT_CURRENCY
  if (c === 'ZA') return 'zar'
  if (c === 'NA') return 'nad'
  if (c === 'GB') return 'gbp'
  if (EUROZONE.has(c)) return 'eur'
  return 'usd' // international default — matches the USD price column
}

// The subscriber's country from Vercel's edge geolocation header. The platform
// sets this header at the edge and overwrites anything the client sends, so it
// is safe to drive billing from. Absent in local/preview (returns null).
export async function detectBillingCountry(): Promise<string | null> {
  const h = await headers()
  return h.get('x-vercel-ip-country')
}

// The currency StayKnit must bill this request's subscriber in, locked to their
// physical location. Falls back to the home market (ZAR) when geo is unknown.
export async function detectBillingCurrency(): Promise<CurrencyCode> {
  return countryToCurrency(await detectBillingCountry())
}
