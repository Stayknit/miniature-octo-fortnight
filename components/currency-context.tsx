'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { currencySymbol, formatMoney } from '@/lib/currency'

// The active currency (stored label like "USD ($)") flows down from the
// signed-in host's settings. Owner portals inherit their host's currency.
const CurrencyContext = createContext<string>('ZAR (R)')

export function CurrencyProvider({ value, children }: { value: string; children: ReactNode }) {
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

// Returns a formatter bound to the active currency: money(12500) -> "$ 12 500".
export function useMoney(): (n: number) => string {
  const currency = useContext(CurrencyContext)
  return (n: number) => formatMoney(n, currency)
}

export function useCurrencySymbol(): string {
  return currencySymbol(useContext(CurrencyContext))
}

export function useCurrency(): string {
  return useContext(CurrencyContext)
}
