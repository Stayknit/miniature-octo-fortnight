// Server-only reconstruction of a monthly accounts statement. Not a 'use
// server' module: it exports a plain async function callable from both the
// admin server action (after assertAdmin) and the download API route (after
// its own admin gate), without becoming an exposed server action itself.

import { db } from '@/lib/db'
import { subscription, user, runningCost } from '@/lib/db/schema'
import { PLANS, planFor, isPaid } from '@/lib/plans'
import { applyPriceOverrides, monthlyCents, DEFAULT_CURRENCY } from '@/lib/pricing'
import { getPriceOverrides } from '@/lib/billing/plan-prices'
import { isCostCurrency, toZarMinor } from '@/lib/fx'
import { asc, desc, eq } from 'drizzle-orm'
import {
  monthBounds,
  currentStatementMonth,
  MONTH_RE,
  type AccountStatement,
  type AccountStatementCostRow,
  type AccountStatementPlanRow,
} from '@/lib/account-statement'

function monthlyOf(amountMinor: number, cadence: string): number {
  return cadence === 'yearly' ? Math.round(amountMinor / 12) : amountMinor
}

function ms(d: Date | null | undefined): number | null {
  return d ? new Date(d).getTime() : null
}

// Reconstructs the operator's P&L for a single month. Revenue is a run-rate
// snapshot: a subscription counts for month M when it had started by month-end
// and was not already canceled before month-start. Costs count when they
// existed by month-end (a cost added later never appears in an earlier month).
export async function computeAccountStatement(month: string): Promise<AccountStatement> {
  const safeMonth = MONTH_RE.test(month) ? month : currentStatementMonth()
  const { startMs, endExclusiveMs, label } = monthBounds(safeMonth)

  const [rows, overrides, costRows] = await Promise.all([
    db
      .select({
        plan: subscription.plan,
        status: subscription.status,
        comp: subscription.comp,
        cancelAt: subscription.cancelAt,
        createdAt: subscription.createdAt,
      })
      .from(subscription)
      .leftJoin(user, eq(user.id, subscription.userId))
      .orderBy(desc(subscription.createdAt)),
    getPriceOverrides(),
    db.select().from(runningCost).orderBy(asc(runningCost.label)),
  ])

  const priceOf = (plan: string): number | null =>
    monthlyCents(applyPriceOverrides(planFor(plan), overrides), DEFAULT_CURRENCY)

  let payingAccounts = 0
  let compAccounts = 0
  let mrrCents = 0
  const planTotals = new Map<string, { count: number; value: number }>()

  for (const r of rows) {
    if (!isPaid(r.plan)) continue

    const created = ms(r.createdAt) ?? 0
    if (created >= endExclusiveMs) continue // not started by month-end

    const cancel = ms(r.cancelAt)
    const endedBeforeMonth = r.status === 'canceled' && cancel !== null && cancel < startMs
    if (endedBeforeMonth) continue

    if (r.comp === true) {
      compAccounts++
      continue
    }

    const cents = priceOf(r.plan)
    payingAccounts++
    if (cents) mrrCents += cents
    const t = planTotals.get(r.plan) ?? { count: 0, value: 0 }
    t.count++
    t.value += cents ?? 0
    planTotals.set(r.plan, t)
  }

  const byPlan: AccountStatementPlanRow[] = PLANS.filter((p) => isPaid(p.key))
    .map((p) => {
      const t = planTotals.get(p.key) ?? { count: 0, value: 0 }
      return { plan: p.key, name: planFor(p.key).name, count: t.count, monthlyValueCents: t.value }
    })
    .filter((p) => p.count > 0)

  const costs: AccountStatementCostRow[] = costRows
    .filter((c) => (ms(c.createdAt) ?? 0) < endExclusiveMs)
    .map((c) => {
      const currency = isCostCurrency(c.currency) ? c.currency.toLowerCase() : 'zar'
      const amountZarCents = toZarMinor(c.amountMinor, c.fxRateMicro ?? 1_000_000)
      const cadence = c.cadence === 'yearly' ? 'yearly' : 'monthly'
      return {
        label: c.label,
        cadence,
        currency,
        amountMinor: c.amountMinor,
        monthlyCents: monthlyOf(amountZarCents, cadence),
      }
    })

  const runningCostMonthlyCents = costs.reduce((sum, c) => sum + c.monthlyCents, 0)

  return {
    month: safeMonth,
    periodLabel: label,
    generatedAt: new Date().toISOString(),
    currency: 'zar',
    payingAccounts,
    compAccounts,
    mrrCents,
    arrCents: mrrCents * 12,
    byPlan,
    costs,
    runningCostMonthlyCents,
    netMonthlyCents: mrrCents - runningCostMonthlyCents,
  }
}
