import type { BillingPeriod, CurrencyCode, PlanDef, PriceOverrides } from '@/lib/types'
import { currencyCode } from '@/lib/currency'
import { periodFor } from '@/lib/plans'

export type { PriceOverrides }

// Re-exported from lib/types (single source of truth) so existing
// `import { CurrencyCode } from '@/lib/pricing'` call sites keep working.
export type { CurrencyCode }

export const DEFAULT_CURRENCY: CurrencyCode = 'zar'

type CurrencyMeta = { code: CurrencyCode; symbol: string; locale: string }

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  zar: { code: 'zar', symbol: 'R', locale: 'en-ZA' },
  usd: { code: 'usd', symbol: '$', locale: 'en-US' },
  eur: { code: 'eur', symbol: '€', locale: 'en-IE' },
  gbp: { code: 'gbp', symbol: '£', locale: 'en-GB' },
  nad: { code: 'nad', symbol: 'N$', locale: 'en-NA' },
}

// Map the host's stored Settings currency (a label/code/symbol such as
// "USD ($)") to a billing code. Anything unrecognised falls back to ZAR,
// StayKnit's home market — so the page never mixes currencies.
export function currencyForSettings(stored: string | null | undefined): CurrencyCode {
  const code = currencyCode(stored).toLowerCase()
  return (code in CURRENCIES ? code : DEFAULT_CURRENCY) as CurrencyCode
}

// StayKnit is a South African business and always SETTLES in ZAR — the Rand is
// the single billing source of truth. Any other currency the app shows (on the
// marketing page, or a foreign card's own statement) is only an approximate
// convenience conversion, never what is actually charged. So regardless of the
// display/region currency, the charge currency is ZAR. (Historically this
// billed foreign cards in their local presentment currency; that was removed so
// pricing is unambiguous and VAT stays cleanly ZAR-based for SARS.)
export function chargeCurrencyFor(_display: CurrencyCode): CurrencyCode {
  return 'zar'
}

export function isCurrencyCode(v: string | null | undefined): v is CurrencyCode {
  return !!v && v in CURRENCIES
}

// Whole-currency-unit formatter (no decimals — all plan amounts are round).
export function formatMoney(amountInCents: number, currency: CurrencyCode): string {
  const { symbol, locale } = CURRENCIES[currency]
  const whole = Math.round(amountInCents / 100)
  return `${symbol}${whole.toLocaleString(locale)}`
}

// Return a copy of a tier with any operator price overrides merged over its
// default monthly rates. Pure and synchronous so it works in both server code
// (the authoritative charge) and client displays; the overrides map is loaded
// once server-side (getPriceOverrides) and passed in. Only currencies present
// in the override are changed — everything else keeps the PLANS default.
export function applyPriceOverrides(plan: PlanDef, overrides?: PriceOverrides): PlanDef {
  if (!overrides || !plan.monthly) return plan
  const forPlan = overrides[plan.key as keyof PriceOverrides]
  if (!forPlan) return plan
  const merged = { ...plan.monthly }
  let changed = false
  for (const [cur, cents] of Object.entries(forPlan)) {
    if (typeof cents === 'number' && Number.isFinite(cents) && cents > 0) {
      merged[cur as CurrencyCode] = cents
      changed = true
    }
  }
  return changed ? { ...plan, monthly: merged } : plan
}

// Apply a whole-percent promo discount (0..100) to an amount in minor units,
// rounding to whole minor units so the charged total stays clean. The pct is
// clamped into range, so a bad/oversized value can never increase the price or
// push it negative. Pure and synchronous so the authoritative server charge and
// the client price display compute the identical figure.
export function applyPromoPct(cents: number, pct: number): number {
  const clamped = Math.min(100, Math.max(0, Math.round(pct)))
  if (!clamped) return cents
  return Math.round((cents * (100 - clamped)) / 100)
}

// The tier's monthly price (minor units) in a currency, falling back to ZAR if
// the tier lacks that currency. Null for non-billable tiers (trial, enterprise).
export function monthlyCents(plan: PlanDef, currency: CurrencyCode): number | null {
  if (!plan.monthly) return null
  return plan.monthly[currency] ?? plan.monthly[DEFAULT_CURRENCY] ?? null
}

// Resolve the upfront charge for a tier + billing period, plus display labels,
// in a given currency. Longer terms reward commitment one of two ways (see
// PERIODS): a percentage discount off the upfront total (6-month → 10% off), or
// bonus free months of access added at the end (1-year → 14 months).
export function periodPricing(plan: PlanDef, currency: CurrencyCode, period: BillingPeriod) {
  const resolved: CurrencyCode = plan.monthly?.[currency] != null ? currency : DEFAULT_CURRENCY
  const base = monthlyCents(plan, resolved)
  const { months, bonusMonths, discountPct } = periodFor(period)
  const accessMonths = months + bonusMonths
  if (base == null) {
    return {
      totalCents: 0,
      perMonthCents: 0,
      effectivePerMonthCents: 0,
      currency: resolved,
      totalLabel: '',
      perMonthLabel: '',
      freeMonths: 0,
      discountPct: 0,
      savedCents: 0,
      accessMonths,
    }
  }
  // Upfront charge: full monthly rate for every paid month, then any period
  // discount comes off that total. Round the saving to whole minor units so
  // the charged amount stays clean.
  const grossCents = base * months
  const savedCents = Math.round((grossCents * discountPct) / 100)
  const totalCents = grossCents - savedCents
  // Effective per-month once the discount / bonus free months are spread across
  // the access window.
  const effectivePerMonthCents = Math.round(totalCents / accessMonths)
  return {
    totalCents,
    perMonthCents: base,
    effectivePerMonthCents,
    currency: resolved,
    totalLabel: formatMoney(totalCents, resolved),
    perMonthLabel: `${formatMoney(base, resolved)} / mo`,
    freeMonths: bonusMonths,
    discountPct,
    savedCents,
    accessMonths,
  }
}
