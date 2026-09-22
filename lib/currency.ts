// Central currency model. The host picks a currency in Settings; it is stored
// as a label like "USD ($)" and drives every money figure across both the host
// and owner portals, plus exported statements.

export type CurrencyDef = { code: string; symbol: string; label: string }

export const CURRENCIES: CurrencyDef[] = [
  { code: 'ZAR', symbol: 'R', label: 'ZAR (R)' },
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'NAD', symbol: 'N$', label: 'NAD (N$)' },
]

export const CURRENCY_LABELS = CURRENCIES.map((c) => c.label)

const DEFAULT = CURRENCIES[0]

// Resolve a stored setting (label, code, or symbol) to its definition.
export function resolveCurrency(stored?: string | null): CurrencyDef {
  if (!stored) return DEFAULT
  const found = CURRENCIES.find((c) => c.label === stored || c.code === stored || c.symbol === stored)
  if (found) return found
  // Unknown stored value like "XYZ (¤)" — pull the symbol from the parentheses.
  const m = stored.match(/\(([^)]+)\)/)
  return { code: stored.slice(0, 3).toUpperCase(), symbol: m ? m[1] : stored, label: stored }
}

export function currencySymbol(stored?: string | null): string {
  return resolveCurrency(stored).symbol
}

export function currencyCode(stored?: string | null): string {
  return resolveCurrency(stored).code
}

// Format a whole-number amount with the given currency, e.g. "$ 12 500".
// Grouping uses spaces so it reads cleanly in every locale we support.
export function formatMoney(n: number, stored?: string | null): string {
  const sym = currencySymbol(stored)
  return `${sym} ${Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ')}`
}
