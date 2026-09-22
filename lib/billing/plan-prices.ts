import { cache } from 'react'
import { db } from '@/lib/db'
import { planPrice } from '@/lib/db/schema'
import { isCurrencyCode } from '@/lib/pricing'
import { isPaid } from '@/lib/plans'
import type { CurrencyCode, PriceOverrides } from '@/lib/types'

// Read all operator price overrides into the shape the pricing helpers expect.
// Wrapped in React `cache` so the many callers in a single render (loader, plan
// screen, marketing page) share ONE query per request. Rows with a bad plan,
// currency, or non-positive amount are ignored so a stray row can never make a
// tier free or negative.
export const getPriceOverrides = cache(async (): Promise<PriceOverrides> => {
  let rows: (typeof planPrice.$inferSelect)[]
  try {
    rows = await db.select().from(planPrice)
  } catch {
    // If the table isn't there yet (fresh deploy before the migration lands),
    // fall back to defaults rather than breaking checkout or the plan screen.
    return {}
  }
  const out: PriceOverrides = {}
  for (const r of rows) {
    const cur = r.currency?.toLowerCase()
    if (!isPaid(r.plan) || !isCurrencyCode(cur)) continue
    if (!Number.isFinite(r.monthlyCents) || r.monthlyCents <= 0) continue
    const key = r.plan as keyof PriceOverrides
    ;(out[key] ??= {})[cur as CurrencyCode] = r.monthlyCents
  }
  return out
})
