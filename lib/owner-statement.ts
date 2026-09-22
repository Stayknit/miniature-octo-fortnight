// Single source of truth for an owner's payout figures. Both the Overview
// (owner-dashboard) and the Statement (owner-costs) render from this one
// builder, so they can never disagree on nights, gross, fees, or net — the
// class of bug that had the two pages showing different totals for the same
// month.
//
// The math: revenue comes from the owner's real booking rows (blocks excluded),
// deductions from the host's cost lines via computeStatement, and net is
// gross minus those deductions. Per-property figures are reconciled to the
// headline with largest-remainder rounding so the breakdown always sums to the
// total shown (no more R2-off statements).

import { computeStatement, costLineToInput, totalCost, type PropertySlice } from '@/lib/costing'
import { currencySymbol } from '@/lib/currency'
import { paidSplit, type StatementHost, type StatementOwner, type StatementProperty } from '@/lib/statement'
import type { Booking, CostLine, OwnerClient } from '@/lib/types'

// Nudge an array of already-rounded integer parts so it sums exactly to
// `target`, adding/removing single rand on the largest entries first. The gap
// is only ever a rand or two of independent rounding, so this keeps every part
// within 1 of its natural value while guaranteeing the parts reconcile to the
// headline total.
function nudgeToSum(parts: number[], target: number): number[] {
  const out = parts.slice()
  let diff = target - out.reduce((a, b) => a + b, 0)
  if (diff === 0 || out.length === 0) return out
  const step = diff > 0 ? 1 : -1
  // Order entries by magnitude so the adjustment lands on the biggest slices,
  // where a single-rand shift is least noticeable.
  const order = out.map((v, i) => i).sort((a, b) => out[b] - out[a])
  let k = 0
  while (diff !== 0) {
    out[order[k % order.length]] += step
    diff -= step
    k++
  }
  return out
}

export type OwnerStatementInput = {
  self: OwnerClient | undefined
  bookings: Booking[]
  costLines: CostLine[]
  vat: { enabled: boolean; rate: number }
  currency?: string
  host?: StatementHost
}

// Build the canonical statement for an owner, or null when there is no owner
// record. Safe to call from client components — it imports no server/db code.
export function buildOwnerStatement({
  self,
  bookings,
  costLines,
  vat,
  currency,
  host,
}: OwnerStatementInput): StatementOwner | null {
  if (!self) return null
  const symbol = currencySymbol(currency)
  const inputs = costLines.map(costLineToInput)
  const rows = bookings.filter((b) => b.status !== 'block' && b.channel.toUpperCase() !== 'BLOCK')

  const perUnit = self.units.map((unit) => {
    const urows = rows.filter((b) => b.propertyName === unit)
    return {
      name: unit,
      gross: urows.reduce((a, b) => a + b.amount, 0),
      nights: urows.reduce((a, b) => a + b.nights, 0),
      bookings: urows.length,
      rows: urows,
    }
  })

  const grossFromBookings = rows.reduce((a, b) => a + b.amount, 0)
  const nightsFromBookings = rows.reduce((a, b) => a + b.nights, 0)
  // With no booking rows (e.g. a manually keyed owner) fall back to the stored
  // aggregate so the statement isn't blank.
  const gross = grossFromBookings || self.gross
  const nights = nightsFromBookings || self.nights

  const slices: PropertySlice[] =
    grossFromBookings > 0
      ? perUnit.map((u) => ({ name: u.name, gross: u.gross, bookings: u.bookings }))
      : [{ name: self.units[0] ?? '', gross, bookings: rows.length }]

  // Itemized deductions and the headline net — internally consistent by
  // construction (net === gross − sum(lines)).
  const lines = computeStatement(inputs, slices, vat, symbol).lines
  const net = gross - totalCost(lines)
  const split = paidSplit(
    rows.map((b) => ({ amount: b.amount, paid: b.paid })),
    net,
  )

  // Per-property breakdown, reconciled to the headline totals so the parts sum
  // to exactly what the top of the statement shows.
  let properties: StatementProperty[] = perUnit.map((u) => {
    const ulines = computeStatement(inputs, [{ name: u.name, gross: u.gross, bookings: u.bookings }], vat, symbol).lines
    const unet = u.gross - totalCost(ulines)
    const usplit = paidSplit(
      u.rows.map((b) => ({ amount: b.amount, paid: b.paid })),
      unet,
    )
    return { name: u.name, nights: u.nights, bookings: u.bookings, gross: u.gross, net: unet, paid: usplit.paid, due: usplit.due }
  })

  if (grossFromBookings > 0 && properties.length > 1) {
    const netParts = nudgeToSum(properties.map((p) => p.net), net)
    const dueParts = nudgeToSum(properties.map((p) => p.due), split.due)
    properties = properties.map((p, i) => ({
      ...p,
      net: netParts[i],
      due: dueParts[i],
      paid: netParts[i] - dueParts[i],
    }))
  }

  return {
    name: self.name,
    email: self.email || undefined,
    property: self.units.length > 1 ? 'All properties' : self.units[0] ?? 'All properties',
    host,
    currency,
    nights,
    bookings: rows.length,
    gross,
    lines,
    net,
    paid: split.paid,
    due: split.due,
    properties,
  }
}
