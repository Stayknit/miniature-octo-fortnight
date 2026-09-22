// Historical FX conversion to ZAR using the European Central Bank reference
// rates served by Frankfurter (free, no API key). We look up the rate for a
// specific date so a foreign-currency running cost is locked to the rate that
// applied when it was incurred, rather than drifting with the live rate.

const HOST = "https://api.frankfurter.dev/v1"

// Currencies the owner can record a running cost in. ZAR is the base.
export const COST_CURRENCIES = ["zar", "eur", "usd"] as const
export type CostCurrency = (typeof COST_CURRENCIES)[number]

export function isCostCurrency(v: string | null | undefined): v is CostCurrency {
  return !!v && (COST_CURRENCIES as readonly string[]).includes(v.toLowerCase())
}

export type FxLookup = { rateMicro: number; asOf: string }

// Clamp/normalise a user-supplied date to YYYY-MM-DD, never in the future
// (Frankfurter has no future rates) and never before its earliest data (1999).
export function normaliseFxDate(input?: string | null): string {
  const today = new Date().toISOString().slice(0, 10)
  const raw = (input ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today
  if (raw > today) return today
  if (raw < "1999-01-04") return "1999-01-04"
  return raw
}

// How many ZAR one unit of `currency` was worth on (or just before) `date`,
// as an integer scaled by 1e6, plus the effective date the rate is from
// (Frankfurter rolls weekends/holidays back to the last trading day). Throws
// if the currency is unsupported or the lookup fails.
export async function getRateToZar(currency: string, date: string): Promise<FxLookup> {
  const cur = currency.toLowerCase()
  if (cur === "zar") return { rateMicro: 1_000_000, asOf: date }
  if (!isCostCurrency(cur)) throw new Error(`Unsupported currency: ${currency}`)

  const day = normaliseFxDate(date)
  const res = await fetch(`${HOST}/${day}?base=${cur.toUpperCase()}&symbols=ZAR`, {
    // Rates for a past date are immutable; let the platform cache them.
    cache: "force-cache",
  })
  if (!res.ok) throw new Error(`FX lookup failed (${res.status})`)
  const data = (await res.json()) as { date?: string; rates?: { ZAR?: number } }
  const rate = data?.rates?.ZAR
  if (!rate || !Number.isFinite(rate)) throw new Error("FX rate unavailable for that date")
  return { rateMicro: Math.round(rate * 1_000_000), asOf: data.date ?? day }
}

// Convert minor units in `currency` to ZAR minor units using a locked rate.
export function toZarMinor(amountMinor: number, fxRateMicro: number): number {
  return Math.round((amountMinor * fxRateMicro) / 1_000_000)
}
