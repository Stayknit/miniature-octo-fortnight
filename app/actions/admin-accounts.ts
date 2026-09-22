'use server'

import { db } from '@/lib/db'
import { subscription, user, runningCost, invoiceEmail } from '@/lib/db/schema'
import { assertAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/admin-audit'
import { PLANS, planFor, isPaid } from '@/lib/plans'
import { applyPriceOverrides, monthlyCents, DEFAULT_CURRENCY } from '@/lib/pricing'
import { getPriceOverrides } from '@/lib/billing/plan-prices'
import { isCostCurrency, getRateToZar, normaliseFxDate, toZarMinor, type CostCurrency } from '@/lib/fx'
import { scanInvoiceInbox, type ScanResult } from '@/lib/invoice-scanner'
import { computeAccountStatement } from '@/lib/account-statement-data'
import type { AccountStatement } from '@/lib/account-statement'
import { and, asc, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

// A subscription is complimentary / demo / pilot when its explicit `comp` flag
// is set. This is a real column, not an inference: a genuine paying account and
// a comp account can otherwise look identical, so shape-based guessing was
// unreliable. Comp accounts sit on a paid tier but are excluded from revenue.
function isComp(sub: { comp: boolean }) {
  return sub.comp === true
}

export type PlanBreakdownRow = {
  plan: string
  name: string
  count: number // active paying (non-comp) accounts on this tier
  monthlyValueCents: number // combined monthly plan value for this tier (ZAR)
}

export type AccountRow = {
  userId: string
  email: string
  name: string
  businessName: string
  plan: string
  planName: string
  billingPeriod: string
  status: string
  monthlyCents: number | null // this account's monthly plan value (ZAR), null for comp
  comp: boolean
  cancelAt: string | null // ISO — access-end / next-renewal date for a paid term
  createdAt: string
}

export type RunningCostRow = {
  id: number
  label: string
  amountMinor: number // as entered, in `currency` minor units, in the given cadence
  currency: CostCurrency // zar | eur | usd
  fxRateMicro: number // (1 unit of currency in ZAR) x 1e6; 1e6 for ZAR
  fxDate: string | null // YYYY-MM-DD the rate is from; null for ZAR
  amountZarCents: number // amount converted to ZAR minor units, in the given cadence
  cadence: 'monthly' | 'yearly'
  monthlyCents: number // ZAR, normalised to monthly (yearly / 12)
  notes: string
}

export type AccountStats = {
  currency: 'zar'
  // Headline counts
  paying: number // active paid, excluding comp
  comp: number // complimentary / pilot grants
  trialing: number // status = trialing (still on a live trial)
  pastDue: number
  canceled: number
  totalSubs: number
  // Revenue, all in ZAR minor units. mrr = summed monthly plan value across
  // paying (non-comp) accounts; arr = mrr x 12. Billing is prepaid, so this is
  // a normalised monthly run-rate, not cash collected this month.
  mrrCents: number
  arrCents: number
  byPlan: PlanBreakdownRow[]
  accounts: AccountRow[] // paying + comp accounts, richest first
  // Operating costs (ZAR minor units), normalised to a monthly figure, plus
  // net = MRR - monthly running cost.
  runningCostMonthlyCents: number
  netMonthlyCents: number
  costs: RunningCostRow[]
}

type CostCadence = 'monthly' | 'yearly'
const VALID_CADENCE = new Set<CostCadence>(['monthly', 'yearly'])

export type RunningCostInput = {
  label: string
  amountCents: number // minor units in `currency`
  cadence: string
  currency?: string // zar | eur | usd (default zar)
  fxDate?: string // YYYY-MM-DD; the date whose rate to lock (foreign currencies only)
  notes?: string
}
export type RunningCostResult = { ok: true; id: number } | { ok: false; error: string }

function monthlyOf(amountMinor: number, cadence: string): number {
  return cadence === 'yearly' ? Math.round(amountMinor / 12) : amountMinor
}

function toIso(d: Date | null): string | null {
  return d ? new Date(d).toISOString() : null
}

// Financial/accounts overview for the owner. Joins every subscription to its
// user and resolves each paid tier's monthly ZAR price (operator overrides
// applied) so the revenue figures match what hosts are actually charged.
export async function getAccountStats(): Promise<AccountStats> {
  await assertAdmin()

  const [rows, overrides, costRows] = await Promise.all([
    db
      .select({
        userId: subscription.userId,
        plan: subscription.plan,
        billingPeriod: subscription.billingPeriod,
        status: subscription.status,
        comp: subscription.comp,
        cancelAt: subscription.cancelAt,
        createdAt: subscription.createdAt,
        email: user.email,
        name: user.name,
        businessName: user.businessName,
      })
      .from(subscription)
      .leftJoin(user, eq(user.id, subscription.userId))
      .orderBy(desc(subscription.createdAt)),
    getPriceOverrides(),
    db.select().from(runningCost).orderBy(asc(runningCost.label)),
  ])

  const costs: RunningCostRow[] = costRows.map((c) => {
    const currency: CostCurrency = isCostCurrency(c.currency) ? (c.currency.toLowerCase() as CostCurrency) : 'zar'
    const fxRateMicro = c.fxRateMicro ?? 1_000_000
    const amountZarCents = toZarMinor(c.amountMinor, fxRateMicro)
    return {
      id: c.id,
      label: c.label,
      amountMinor: c.amountMinor,
      currency,
      fxRateMicro,
      fxDate: c.fxDate ?? null,
      amountZarCents,
      cadence: c.cadence === 'yearly' ? 'yearly' : 'monthly',
      monthlyCents: monthlyOf(amountZarCents, c.cadence),
      notes: c.notes,
    }
  })
  const runningCostMonthlyCents = costs.reduce((sum, c) => sum + c.monthlyCents, 0)

  // Resolve a plan's monthly price in ZAR with overrides merged in.
  const priceOf = (plan: string): number | null => {
    const def = applyPriceOverrides(planFor(plan), overrides)
    return monthlyCents(def, DEFAULT_CURRENCY)
  }

  let paying = 0
  let comp = 0
  let trialing = 0
  let pastDue = 0
  let canceled = 0
  let mrrCents = 0

  const planTotals = new Map<string, { count: number; value: number }>()
  const accounts: AccountRow[] = []

  for (const r of rows) {
    if (r.status === 'trialing') trialing++
    if (r.status === 'past_due') pastDue++
    if (r.status === 'canceled') canceled++

    const compAccount = isComp(r)
    const paidActive = isPaid(r.plan) && r.status === 'active'

    if (compAccount) comp++

    if (paidActive) {
      const cents = priceOf(r.plan)
      const isPayingNow = !compAccount
      if (isPayingNow) {
        paying++
        if (cents) mrrCents += cents
        const t = planTotals.get(r.plan) ?? { count: 0, value: 0 }
        t.count++
        t.value += cents ?? 0
        planTotals.set(r.plan, t)
      }
      accounts.push({
        userId: r.userId,
        email: r.email ?? '(deleted user)',
        name: r.name ?? '',
        businessName: r.businessName ?? '',
        plan: r.plan,
        planName: planFor(r.plan).name,
        billingPeriod: r.billingPeriod,
        status: r.status,
        monthlyCents: isPayingNow ? cents : null,
        comp: compAccount,
        cancelAt: toIso(r.cancelAt),
        createdAt: toIso(r.createdAt) ?? new Date().toISOString(),
      })
    }
  }

  // Plan breakdown in the canonical PLANS order (only paid tiers appear).
  const byPlan: PlanBreakdownRow[] = PLANS.filter((p) => isPaid(p.key)).map((p) => {
    const t = planTotals.get(p.key) ?? { count: 0, value: 0 }
    return { plan: p.key, name: p.name, count: t.count, monthlyValueCents: t.value }
  })

  // Richest accounts first; comp accounts (null value) sink to the bottom.
  accounts.sort((a, b) => (b.monthlyCents ?? -1) - (a.monthlyCents ?? -1))

  return {
    currency: 'zar',
    paying,
    comp,
    trialing,
    pastDue,
    canceled,
    totalSubs: rows.length,
    mrrCents,
    arrCents: mrrCents * 12,
    byPlan,
    accounts,
    runningCostMonthlyCents,
    netMonthlyCents: mrrCents - runningCostMonthlyCents,
    costs,
  }
}

// Monthly accounts statement for the given YYYY-MM (owner only). Powers the
// live preview in the dashboard; downloads go through the API route, which
// re-runs the same compute behind its own admin gate.
export async function getAccountStatement(month: string): Promise<AccountStatement> {
  await assertAdmin()
  return computeAccountStatement(month)
}

// ---- Running-cost CRUD (owner only) ----------------------------------------

type ParsedCost = {
  label: string
  amountMinor: number
  cadence: CostCadence
  currency: CostCurrency
  fxDate: string
  notes: string
}

function parseCost(input: RunningCostInput): ParsedCost | null {
  const label = input.label?.trim()
  if (!label) return null
  const amountMinor = Math.round(Number(input.amountCents))
  if (!Number.isFinite(amountMinor) || amountMinor < 0) return null
  const cadence = (input.cadence as CostCadence) || 'monthly'
  if (!VALID_CADENCE.has(cadence)) return null
  const currency: CostCurrency = isCostCurrency(input.currency) ? (input.currency.toLowerCase() as CostCurrency) : 'zar'
  const fxDate = normaliseFxDate(input.fxDate)
  return { label, amountMinor, cadence, currency, fxDate, notes: input.notes?.trim() ?? '' }
}

// Resolve the ZAR conversion for a parsed cost, locking the rate to its date.
// ZAR costs are 1:1. Returns the DB column values shared by insert and update.
async function fxColumnsFor(parsed: ParsedCost): Promise<
  { ok: true; values: { currency: string; fxRateMicro: number; fxDate: string | null } } | { ok: false; error: string }
> {
  if (parsed.currency === 'zar') {
    return { ok: true, values: { currency: 'ZAR', fxRateMicro: 1_000_000, fxDate: null } }
  }
  try {
    const fx = await getRateToZar(parsed.currency, parsed.fxDate)
    return {
      ok: true,
      values: { currency: parsed.currency.toUpperCase(), fxRateMicro: fx.rateMicro, fxDate: fx.asOf },
    }
  } catch {
    return { ok: false, error: 'Could not fetch the exchange rate for that date. Check the date and try again.' }
  }
}

export async function addRunningCost(input: RunningCostInput): Promise<RunningCostResult> {
  const admin = await assertAdmin()
  const parsed = parseCost(input)
  if (!parsed) return { ok: false, error: 'Enter a label and a valid amount.' }
  const fx = await fxColumnsFor(parsed)
  if (!fx.ok) return { ok: false, error: fx.error }
  const [row] = await db
    .insert(runningCost)
    .values({
      label: parsed.label,
      amountMinor: parsed.amountMinor,
      cadence: parsed.cadence,
      notes: parsed.notes,
      ...fx.values,
    })
    .returning({ id: runningCost.id })
  await logAdminAction(
    admin.email,
    '',
    'cost.add',
    `#${row.id} "${parsed.label}" ${parsed.currency} ${(parsed.amountMinor / 100).toFixed(2)}/${parsed.cadence}`,
  )
  revalidatePath('/admin/accounts')
  revalidatePath('/admin')
  return { ok: true, id: row.id }
}

export async function updateRunningCost(id: number, input: RunningCostInput): Promise<RunningCostResult> {
  const admin = await assertAdmin()
  const parsed = parseCost(input)
  if (!parsed) return { ok: false, error: 'Enter a label and a valid amount.' }
  const fx = await fxColumnsFor(parsed)
  if (!fx.ok) return { ok: false, error: fx.error }
  await db
    .update(runningCost)
    .set({
      label: parsed.label,
      amountMinor: parsed.amountMinor,
      cadence: parsed.cadence,
      notes: parsed.notes,
      ...fx.values,
      updatedAt: new Date(),
    })
    .where(eq(runningCost.id, id))
  await logAdminAction(
    admin.email,
    '',
    'cost.update',
    `#${id} "${parsed.label}" ${parsed.currency} ${(parsed.amountMinor / 100).toFixed(2)}/${parsed.cadence}`,
  )
  revalidatePath('/admin/accounts')
  revalidatePath('/admin')
  return { ok: true, id }
}

export async function deleteRunningCost(id: number): Promise<{ ok: true }> {
  const admin = await assertAdmin()
  await db.delete(runningCost).where(eq(runningCost.id, id))
  await logAdminAction(admin.email, '', 'cost.delete', `#${id}`)
  revalidatePath('/admin/accounts')
  revalidatePath('/admin')
  return { ok: true }
}

// ---- Invoice review queue (owner only) -------------------------------------

// A parsed invoice email awaiting the owner's review. Amount fields mirror a
// running cost: `amountMinor` in `currency`, converted to ZAR (`amountZarCents`)
// at a rate locked to the invoice date.
export type PendingInvoiceRow = {
  id: number
  vendor: string
  fromAddress: string
  subject: string
  summary: string
  amountMinor: number
  currency: CostCurrency
  amountZarCents: number
  fxDate: string | null
  invoiceDate: string | null
  cadence: 'monthly' | 'yearly'
  confidence: number
  receivedAt: string // ISO
}

export async function getPendingInvoices(): Promise<PendingInvoiceRow[]> {
  await assertAdmin()
  const rows = await db
    .select()
    .from(invoiceEmail)
    .where(eq(invoiceEmail.status, 'pending'))
    .orderBy(desc(invoiceEmail.receivedAt))
  return rows.map((r) => ({
    id: r.id,
    vendor: r.vendor,
    fromAddress: r.fromAddress,
    subject: r.subject,
    summary: r.summary,
    amountMinor: r.amountMinor,
    currency: isCostCurrency(r.currency) ? (r.currency.toLowerCase() as CostCurrency) : 'usd',
    amountZarCents: r.amountZarCents,
    fxDate: r.fxDate ?? null,
    invoiceDate: r.invoiceDate ?? null,
    cadence: r.cadence === 'yearly' ? 'yearly' : 'monthly',
    confidence: r.confidence,
    receivedAt: toIso(r.receivedAt) ?? new Date().toISOString(),
  }))
}

// Approve a parsed invoice: create a running cost from its (already FX-locked)
// values and mark the invoice approved + linked. Optional overrides let the
// owner correct the label/amount/currency/date before it lands in the books.
export type ApproveInvoiceInput = {
  label?: string
  amountCents?: number
  currency?: string
  fxDate?: string
  cadence?: string
  notes?: string
}

export async function approveInvoice(id: number, overrides?: ApproveInvoiceInput): Promise<RunningCostResult> {
  const admin = await assertAdmin()
  const [inv] = await db.select().from(invoiceEmail).where(eq(invoiceEmail.id, id))
  if (!inv) return { ok: false, error: 'Invoice not found.' }
  if (inv.status !== 'pending') return { ok: false, error: 'This invoice has already been handled.' }

  const parsed = parseCost({
    label: overrides?.label ?? inv.vendor ?? inv.subject,
    amountCents: overrides?.amountCents ?? inv.amountMinor,
    cadence: overrides?.cadence ?? inv.cadence,
    currency: overrides?.currency ?? inv.currency,
    // Lock FX to the corrected date, else the stored invoice date, else its recorded fxDate.
    fxDate: overrides?.fxDate ?? inv.invoiceDate ?? inv.fxDate ?? undefined,
    notes: overrides?.notes ?? inv.summary,
  })
  if (!parsed) return { ok: false, error: 'The invoice is missing a label or valid amount; edit it before approving.' }

  const fx = await fxColumnsFor(parsed)
  if (!fx.ok) return { ok: false, error: fx.error }

  const [row] = await db
    .insert(runningCost)
    .values({
      label: parsed.label,
      amountMinor: parsed.amountMinor,
      cadence: parsed.cadence,
      notes: parsed.notes,
      ...fx.values,
    })
    .returning({ id: runningCost.id })

  await db
    .update(invoiceEmail)
    .set({ status: 'approved', linkedCostId: row.id, updatedAt: new Date() })
    .where(eq(invoiceEmail.id, id))

  await logAdminAction(
    admin.email,
    '',
    'invoice.approve',
    `invoice #${id} (${inv.vendor}) -> cost #${row.id} "${parsed.label}" ${parsed.currency} ${(parsed.amountMinor / 100).toFixed(2)}`,
  )
  revalidatePath('/admin/accounts')
  revalidatePath('/admin')
  return { ok: true, id: row.id }
}

export async function dismissInvoice(id: number): Promise<{ ok: true }> {
  const admin = await assertAdmin()
  await db
    .update(invoiceEmail)
    .set({ status: 'dismissed', updatedAt: new Date() })
    .where(and(eq(invoiceEmail.id, id), eq(invoiceEmail.status, 'pending')))
  await logAdminAction(admin.email, '', 'invoice.dismiss', `invoice #${id}`)
  revalidatePath('/admin/accounts')
  return { ok: true }
}

// Manually trigger a mailbox scan from the Accounts UI (in addition to the
// scheduled cron), so the owner can pull invoices on demand.
export async function scanInvoicesNow(): Promise<ScanResult> {
  await assertAdmin()
  const result = await scanInvoiceInbox()
  revalidatePath('/admin/accounts')
  return result
}
